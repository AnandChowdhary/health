import { promises as fs } from "fs";
import { basename, join } from "path";

const HEIGHT = 170; // cm
const BIRTHDAY = new Date("1997-12-29");
const DATA_DIR = "./data";
const SKIP_FOR_BLOOD_TESTS = ["weight.csv", "body-composition.csv"];

const twoDecimals = (num) => Math.round(num * 100) / 100;

/**
 * Parse a CSV file into an array of objects
 * @param {string} filePath - Path to the CSV file
 * @returns {Promise<{ headers: string[], data: Record<string, string|number>[] }>}
 */
const parseCSV = async (filePath) => {
  const file = await fs.readFile(filePath, "utf-8");
  const lines = file.split("\n").filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim());
  const data = lines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      return headers.reduce((acc, header, index) => {
        const raw = (values[index] || "").trim();
        if (!raw) return acc;
        if (header === "date") {
          acc[header] = new Date(raw).toISOString().slice(0, 10);
        } else {
          const num = Number(raw.replace("%", ""));
          acc[header] = isNaN(num) ? raw : twoDecimals(num);
        }
        return acc;
      }, {});
    })
    .filter((d) => d.date)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { headers, data };
};

/**
 * Interpolate time series data to a value for each day
 * @param {{ date: Date, value: number }[]} data
 * @returns {{ date: Date, value: number }[]}
 */
const interpolateTimeSeries = (data) => {
  data = data.sort((a, b) => a.date.getTime() - b.date.getTime());
  const interpolatedData = [];
  for (let i = 0; i < data.length - 1; i++) {
    const currentDate = new Date(data[i].date);
    const nextDate = new Date(data[i + 1].date);
    const currentValue = data[i].value;
    const nextValue = data[i + 1].value;
    const timeDiff = nextDate.getTime() - currentDate.getTime();
    const valueDiff = nextValue - currentValue;
    const daysDiff = timeDiff / (1000 * 3600 * 24);
    for (let j = 0; j < daysDiff; j++) {
      const interpolatedValue = currentValue + (valueDiff / daysDiff) * j;
      interpolatedData.push({
        date: new Date(currentDate.getTime() + j * (1000 * 3600 * 24)),
        value: twoDecimals(interpolatedValue),
      });
    }
  }
  interpolatedData.push(data[data.length - 1]);
  return interpolatedData;
};

const getSummaryRow = (label, data) => {
  const interpolatedData = interpolateTimeSeries(data);
  return `| ${label} | **${interpolatedData[
    interpolatedData.length - 1
  ].value.toFixed(2)}** | ${(
    interpolatedData.map((i) => i.value).reduce((acc, v) => acc + v, 0) /
    interpolatedData.length
  ).toFixed(2)} | ${Math.min(...interpolatedData.map((i) => i.value)).toFixed(
    2,
  )} | ${Math.max(...interpolatedData.map((i) => i.value)).toFixed(2)} |`;
};

const categoryDisplayName = (filename) =>
  basename(filename, ".csv")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const getStatus = (value, min, max) => {
  if (value == null || isNaN(value)) return "";
  if (min != null && value < min) return "Low";
  if (max != null && value > max) return "High";
  return "Normal";
};

const formatRange = (min, max) => {
  if (min != null && max != null) return `${min}--${max}`;
  if (min != null) return `>= ${min}`;
  if (max != null) return `<= ${max}`;
  return "";
};

/**
 * Build a QuickChart line chart for a blood test category with reference range bands
 */
const buildBloodTestChart = (dates, metrics, refRanges) => {
  const colors = [
    "#4c78a8",
    "#f58518",
    "#e45756",
    "#72b7b2",
    "#54a24b",
    "#eeca3b",
    "#b279a2",
    "#ff9da6",
  ];
  const datasets = [];
  let colorIdx = 0;

  for (const metric of metrics) {
    const ref = refRanges[metric.key] || {};
    const color = colors[colorIdx % colors.length];
    colorIdx++;
    const label = ref.label
      ? `${ref.label}${ref.unit ? ` (${ref.unit})` : ""}`
      : metric.key;

    datasets.push({
      label,
      data: metric.values,
      borderColor: color,
      backgroundColor: color,
      fill: false,
      pointRadius: 5,
      pointHoverRadius: 7,
      spanGaps: true,
    });

    if (ref.min != null && ref.max != null) {
      datasets.push({
        label: `${ref.label} ref max`,
        data: dates.map(() => ref.max),
        borderColor: "rgba(75, 192, 75, 0.3)",
        backgroundColor: "rgba(75, 192, 75, 0.08)",
        fill: "+1",
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [5, 5],
      });
      datasets.push({
        label: `${ref.label} ref min`,
        data: dates.map(() => ref.min),
        borderColor: "rgba(75, 192, 75, 0.3)",
        backgroundColor: "transparent",
        fill: false,
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [5, 5],
      });
    } else if (ref.max != null) {
      datasets.push({
        label: `${ref.label} ref max`,
        data: dates.map(() => ref.max),
        borderColor: "rgba(75, 192, 75, 0.3)",
        backgroundColor: "transparent",
        fill: false,
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [5, 5],
      });
    } else if (ref.min != null) {
      datasets.push({
        label: `${ref.label} ref min`,
        data: dates.map(() => ref.min),
        borderColor: "rgba(75, 192, 75, 0.3)",
        backgroundColor: "transparent",
        fill: false,
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [5, 5],
      });
    }
  }

  const config = {
    type: "line",
    data: { labels: dates, datasets },
    options: {
      scales: { xAxes: [{ type: "time" }] },
      legend: { labels: { filter: (item) => !item.text.includes(" ref ") } },
    },
  };
  return `https://quickchart.io/chart?width=1000&height=500&format=svg&chart=${encodeURIComponent(
    JSON.stringify(config),
  )}`;
};

/**
 * Group metrics by unit so metrics with the same unit share a chart
 */
const groupMetricsByUnit = (headers, data, refRanges) => {
  const groups = {};
  const metricKeys = headers.filter((h) => h !== "date");
  for (const key of metricKeys) {
    const ref = refRanges[key] || {};
    const unit = ref.unit || "other";
    if (!groups[unit]) groups[unit] = [];
    groups[unit].push({
      key,
      values: data.map((d) =>
        d[key] != null && !isNaN(d[key]) ? d[key] : null,
      ),
    });
  }
  return groups;
};

(async () => {
  const readme = await fs.readFile("./README.md", "utf-8");
  const start = readme.indexOf("<!-- start graphs -->");
  const end = readme.indexOf("<!-- end graphs -->");
  const startText = readme.slice(0, start);
  const endText = readme.slice(end);

  // Weight
  const { data: weightData } = await parseCSV(join(DATA_DIR, "weight.csv"));
  const filteredWeight = weightData.filter((d) => d.kg);
  const weightConfig = {
    type: "line",
    data: {
      labels: filteredWeight.map((d) => d.date),
      datasets: [
        {
          label: "Weight (kg)",
          data: filteredWeight.map((d) => d.kg),
          fill: false,
          lineTension: 0.4,
        },
      ],
    },
    options: { scales: { xAxes: [{ type: "time" }] } },
  };
  const weightChartUrl = `https://quickchart.io/chart?width=1000&height=500&format=svg&chart=${encodeURIComponent(
    JSON.stringify(weightConfig),
  )}`;

  // Body composition
  const { data: compositionData } = await parseCSV(
    join(DATA_DIR, "body-composition.csv"),
  );
  const filteredComposition = compositionData.filter((d) => d.bone);
  const compositionConfig = {
    type: "line",
    data: {
      labels: filteredComposition.map((d) => d.date),
      datasets: [
        {
          label: "Bone (%)",
          data: filteredComposition.map((d) => d.bone),
          fill: false,
          lineTension: 0.4,
        },
        {
          label: "Fat (%)",
          data: filteredComposition.map((d) => d.fat),
          fill: false,
        },
        {
          label: "Muscle (%)",
          data: filteredComposition.map((d) => d.muscle),
          fill: false,
        },
        {
          label: "Water (%)",
          data: filteredComposition.map((d) => d.water),
          fill: false,
        },
      ],
    },
    options: { scales: { xAxes: [{ type: "time" }] } },
  };
  const compositionChartUrl = `https://quickchart.io/chart?width=1000&height=500&format=svg&chart=${encodeURIComponent(
    JSON.stringify(compositionConfig),
  )}`;

  // Blood test CSVs — auto-discover
  const referenceRanges = JSON.parse(
    await fs.readFile(join(DATA_DIR, "reference-ranges.json"), "utf-8"),
  );
  const allFiles = await fs.readdir(DATA_DIR);
  const bloodTestFiles = allFiles
    .filter((f) => f.endsWith(".csv") && !SKIP_FOR_BLOOD_TESTS.includes(f))
    .sort();

  const bloodTestCharts = [];
  let bloodTestStats = "";

  for (const file of bloodTestFiles) {
    const categoryKey = basename(file, ".csv");
    const displayName = categoryDisplayName(file);
    const refRanges = referenceRanges[categoryKey] || {};
    const { headers, data } = await parseCSV(join(DATA_DIR, file));
    if (data.length === 0) continue;

    const dates = data.map((d) => d.date);
    const metricKeys = headers.filter((h) => h !== "date");

    // Only generate charts if data spans more than 3 years
    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);
    const yearSpan =
      (lastDate.getTime() - firstDate.getTime()) / (365.25 * 24 * 3600_000);

    if (yearSpan > 3) {
      const groups = groupMetricsByUnit(headers, data, refRanges);
      const unitKeys = Object.keys(groups);
      if (unitKeys.length === 1) {
        const metrics = groups[unitKeys[0]];
        const chartUrl = buildBloodTestChart(dates, metrics, refRanges);
        bloodTestCharts.push({
          name: displayName,
          url: chartUrl,
        });
      } else {
        for (const unit of unitKeys) {
          const metrics = groups[unit];
          const chartUrl = buildBloodTestChart(dates, metrics, refRanges);
          const unitLabel = unit || "other";
          bloodTestCharts.push({
            name: `${displayName} (${unitLabel})`,
            url: chartUrl,
          });
        }
      }
    }

    // Stats table
    const dateHeaders = dates.map((d) => d).join(" | ");
    bloodTestStats += `\n### ${displayName}\n\n| Metric | Ref Range | ${dateHeaders} | Status |\n| --- | --- | ${dates
      .map(() => "---")
      .join(" | ")} | --- |\n`;

    for (const key of metricKeys) {
      const ref = refRanges[key] || {};
      const label = ref.label
        ? `${ref.label}${ref.unit ? ` (${ref.unit})` : ""}`
        : key;
      const range = formatRange(ref.min, ref.max);
      const values = dates.map((_, i) => {
        const v = data[i][key];
        return v != null && !isNaN(v) ? Number(v).toFixed(2) : "";
      });
      const lastValue = [...values].reverse().find((v) => v !== "");
      const status = lastValue
        ? getStatus(Number(lastValue), ref.min, ref.max)
        : "";
      const statusCell =
        status === "High" || status === "Low"
          ? `**$\\color{red}{\\textsf{${status}}}$**`
          : status;
      bloodTestStats += `| ${label} | ${range} | ${values.join(" | ")} | ${statusCell} |\n`;
    }
  }

  // Build blood test charts as a 3-column table
  let bloodTestGraphs = "";
  if (bloodTestCharts.length > 0) {
    bloodTestGraphs += "\n### Blood Tests\n\n| | | |\n| --- | --- | --- |\n";
    for (let i = 0; i < bloodTestCharts.length; i += 3) {
      const cells = [0, 1, 2].map((offset) => {
        const idx = i + offset;
        if (idx >= bloodTestCharts.length) return "";
        return `**${bloodTestCharts[idx].name}** <br> ![${bloodTestCharts[idx].name}](${bloodTestCharts[idx].url})`;
      });
      bloodTestGraphs += `| ${cells.join(" | ")} |\n`;
    }
  }

  // Build graphs section
  const newReadme = `${startText}<!-- start graphs -->

### Weight

![Chart showing weight over time](${weightChartUrl})

### Body composition

![Chart showing body composition over time](${compositionChartUrl})
${bloodTestGraphs}
${endText}`;

  // Build stats section
  const startTextStats = newReadme.split("<!-- start stats -->")[0];
  const endTextStats = newReadme.split("<!-- end stats -->")[1];
  const currentAge = (
    (new Date().getTime() - BIRTHDAY.getTime()) /
    (365.25 * 24 * 3600_000)
  ).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const interpolatedWeightData = interpolateTimeSeries(
    filteredWeight.map((d) => ({ date: new Date(d.date), value: d.kg })),
  );
  const interpolatedBmiData = filteredWeight.map((d) => ({
    date: new Date(d.date),
    value: twoDecimals(d.kg / ((HEIGHT / 100) * (HEIGHT / 100))),
  }));
  const interpolatedBoneData = interpolateTimeSeries(
    filteredComposition.map((d) => ({ date: new Date(d.date), value: d.bone })),
  );
  const interpolatedFatData = interpolateTimeSeries(
    filteredComposition.map((d) => ({ date: new Date(d.date), value: d.fat })),
  );
  const interpolatedMuscleData = interpolateTimeSeries(
    filteredComposition.map((d) => ({
      date: new Date(d.date),
      value: d.muscle,
    })),
  );
  const interpolatedWaterData = interpolateTimeSeries(
    filteredComposition.map((d) => ({
      date: new Date(d.date),
      value: d.water,
    })),
  );

  const stats = `
| Metric   | Value | Mean | Min   | Max   |
| -------- | ----- | ---- | ----- | ----- |
| Age (years) | **${currentAge}** | | | |
| Height (cm) | **${HEIGHT.toFixed(2)}** | | | |
${getSummaryRow("Weight (kg)", interpolatedWeightData)}
${getSummaryRow("BMI (kg/m²)", interpolatedBmiData)}
${getSummaryRow("Bone (%)", interpolatedBoneData)}
${getSummaryRow("Fat (%)", interpolatedFatData)}
${getSummaryRow("Muscle (%)", interpolatedMuscleData)}
${getSummaryRow("Water (%)", interpolatedWaterData)}
`;

  const bloodTestStatsSection = bloodTestStats
    ? `\n## Blood Tests\n${bloodTestStats}`
    : "";

  const newReadmeWithStats = `${startTextStats}<!-- start stats -->\n${stats}\n${bloodTestStatsSection}\n_Last updated: ${new Date().toLocaleDateString(
    "en-US",
    { dateStyle: "long" },
  )}_\n\n<!-- end stats -->${endTextStats}`;
  await fs.writeFile("./README.md", newReadmeWithStats);
})();

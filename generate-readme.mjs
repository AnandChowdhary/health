import { promises as fs } from "fs";

const HEIGHT = 170; // cm
const BIRTHDAY = new Date("1997-12-29");

const twoDecimals = (num) => Math.round(num * 100) / 100;

/**
 * Interpolate time series data to a value for each day
 * @param {{ date: Date, value: number }[]} data - Time series data
 * @returns {{ date: Date, value: number }[]} Interpolated time series data
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

/**
 * Get a summary row for a metric
 * @param {string} label - Metric label
 * @param {{ date: Date, value: number }[]} data - Time series data
 * @returns {string} Summary row in Markdown table format
 */
const getSummaryRow = (label, data) => {
  const interpolatedData = interpolateTimeSeries(data);
  return `| ${label} | **${interpolatedData[
    interpolatedData.length - 1
  ].value.toFixed(2)}** | ${(
    interpolatedData.map((i) => i.value).reduce((acc, v) => acc + v, 0) /
    interpolatedData.length
  ).toFixed(2)} | ${Math.min(...interpolatedData.map((i) => i.value)).toFixed(
    2
  )} | ${Math.max(...interpolatedData.map((i) => i.value)).toFixed(2)} |`;
};

(async () => {
  const readme = await fs.readFile("./README.md", "utf-8");
  // README includes <!-- start graphs --> and <!-- end graphs -->
  const start = readme.indexOf("<!-- start graphs -->");
  const end = readme.indexOf("<!-- end graphs -->");
  const startText = readme.slice(0, start);
  const endText = readme.slice(end);

  const weightFile = await fs.readFile("./weight.csv", "utf-8");
  const weightLines = weightFile.split("\n");
  const weightHeaders = weightLines[0]
    .split(",")
    .map((header) => header.trim());
  const weightData = weightLines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      return weightHeaders.reduce((acc, header, index) => {
        if (values[index])
          acc[header] =
            header === "date"
              ? new Date(values[index].trim()).toISOString().slice(0, 10)
              : twoDecimals(Number(values[index]));
        return acc;
      }, {});
    })
    .filter((d) => d.date && d.kg)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const weightConfig = {
    type: "line",
    data: {
      labels: weightData.map((d) => d.date),
      datasets: [
        {
          label: "Weight (kg)",
          data: weightData.map((d) => d.kg),
          fill: false,
          lineTension: 0.4,
        },
      ],
    },
    options: { scales: { xAxes: [{ type: "time" }] } },
  };
  const weightChartUrl = `https://quickchart.io/chart?width=1000&height=500&format=svg&chart=${encodeURIComponent(
    JSON.stringify(weightConfig)
  )}`;

  const compositionFile = await fs.readFile("./body-composition.csv", "utf-8");
  const compositionLines = compositionFile.split("\n");
  const compositionHeaders = compositionLines[0]
    .split(",")
    .map((header) => header.trim());
  const compositionData = compositionLines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      return compositionHeaders.reduce((acc, header, index) => {
        if (values[index])
          acc[header] =
            header === "date"
              ? new Date(values[index].trim()).toISOString().slice(0, 10)
              : twoDecimals(Number(values[index].replace("%", "")));
        return acc;
      }, {});
    })
    .filter((d) => d.date && d.bone)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const compositionConfig = {
    type: "line",
    data: {
      labels: compositionData.map((d) => d.date),
      datasets: [
        {
          label: "Bone (%)",
          data: compositionData.map((d) => d.bone),
          fill: false,
          lineTension: 0.4,
        },
        {
          label: "Fat (%)",
          data: compositionData.map((d) => d.fat),
          fill: false,
        },
        {
          label: "Muscle (%)",
          data: compositionData.map((d) => d.muscle),
          fill: false,
        },
        {
          label: "Water (%)",
          data: compositionData.map((d) => d.water),
          fill: false,
        },
      ],
    },
    options: { scales: { xAxes: [{ type: "time" }] } },
  };
  const compositionChartUrl = `https://quickchart.io/chart?width=1000&height=500&format=svg&chart=${encodeURIComponent(
    JSON.stringify(compositionConfig)
  )}`;

  const newReadme = `${startText}<!-- start graphs -->

### Weight

![Chart showing weight over time](${weightChartUrl})

### Body composition

![Chart showing body composition over time](${compositionChartUrl})

${endText}`;

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
    weightData.map((d) => ({ date: new Date(d.date), value: d.kg }))
  );
  const interpolatedBmiData = weightData.map((d) => ({
    date: new Date(d.date),
    value: twoDecimals(d.kg / ((HEIGHT / 100) * (HEIGHT / 100))),
  }));
  const interpolatedBoneData = interpolateTimeSeries(
    compositionData.map((d) => ({ date: new Date(d.date), value: d.bone }))
  );
  const interpolatedFatData = interpolateTimeSeries(
    compositionData.map((d) => ({ date: new Date(d.date), value: d.fat }))
  );
  const interpolatedMuscleData = interpolateTimeSeries(
    compositionData.map((d) => ({ date: new Date(d.date), value: d.muscle }))
  );
  const interpolatedWaterData = interpolateTimeSeries(
    compositionData.map((d) => ({ date: new Date(d.date), value: d.water }))
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

  const newReadmeWithStats = `${startTextStats}<!-- start stats -->\n${stats}\n_Last updated: ${new Date().toLocaleDateString(
    "en-US",
    { dateStyle: "long" }
  )}_\n\n<!-- end stats -->${endTextStats}`;
  await fs.writeFile("./README.md", newReadmeWithStats);
})();

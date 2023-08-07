import { promises as fs } from "fs";

const twoDecimals = (num) => Math.round(num * 100) / 100;

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
        },
      ],
    },
    options: { scales: { x: { type: "time" } } },
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
    options: { scales: { x: { type: "time" } } },
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
  await fs.writeFile("./README.md", newReadme);
})();

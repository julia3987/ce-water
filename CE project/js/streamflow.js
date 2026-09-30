import {
  UNIT_LABEL,
  DRY_MONTHS,
  WET_MONTHS,
  BASINS
} from "./config.js";

import {
  el,
  normalizeKey,
  normalizeDate,
  resolveColumn,
  avg,
  monthFromDateStr
} from "./utils.js";

import {
  getStationRainfall
} from "./rainfall.js";


const observedCache = {};
const simulatedCache = {};

let chart = null;


// ============================================================
// DAILY STREAMFLOW CHART
// ============================================================

export function initStreamflowChart() {
  if (chart) {
    return chart;
  }

  const canvas = el("stationChart");

  if (!canvas) {
    return null;
  }

  chart = new Chart(canvas, {
    type: "line",

    data: {
      labels: [],

      datasets: [
        {
          label: "Observed",
          data: [],
          borderColor: "#2563eb",
          backgroundColor: "#2563eb",
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          hidden: false
        },

        {
          label: "Simulated",
          data: [],
          borderColor: "#dc2626",
          backgroundColor: "#dc2626",
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
          hidden: false
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      interaction: {
        mode: "nearest",
        intersect: false
      },

      plugins: {
        legend: {
          display: true
        },

        tooltip: {
          callbacks: {
            title: (items) =>
              items?.[0]?.label || "",

            label: (ctx) => {
              const y = ctx.parsed.y;

              return `${ctx.dataset.label}: ${
                Number.isFinite(y)
                  ? Math.round(y)
                  : "—"
              } ${UNIT_LABEL}`;
            }
          }
        }
      },

      scales: {
        x: {
          ticks: {
            maxTicksLimit: 10
          },

          title: {
            display: true,
            text: "Date"
          }
        },

        y: {
          title: {
            display: true,
            text: `Streamflow (${UNIT_LABEL})`
          }
        }
      }
    }
  });

  return chart;
}


// ============================================================
// LOAD STREAMFLOW CSV
// ============================================================

async function loadSeriesCsv(
  url,
  cacheObject,
  basinKey
) {
  if (cacheObject[basinKey]) {
    return cacheObject[basinKey];
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not load CSV: ${url}`
    );
  }

  const text = await response.text();

  const lines = text
    .trim()
    .split(/\r?\n/);

  const header = lines[0]
    .split(",")
    .map((value) => value.trim());

  const dateIndex =
    header.indexOf("Date");

  if (dateIndex === -1) {
    throw new Error(
      `CSV must have a "Date" column`
    );
  }

  const columns =
    header.filter(
      (heading) =>
        heading !== "Date"
    );

  const dates = [];
  const series = {};

  columns.forEach((column) => {
    series[column] = [];
  });

  for (
    let i = 1;
    i < lines.length;
    i++
  ) {
    const parts =
      lines[i].split(",");

    const rawDate =
      parts[dateIndex];

    // normalizeDate() supports both:
    // YYYY-MM-DD
    // M/D/YYYY
    //
    // The second format is important for
    // Simulation_Mekong.csv.
    const date =
      normalizeDate(rawDate);

    if (!date) {
      continue;
    }

    dates.push(date);

    columns.forEach((column) => {
      const columnIndex =
        header.indexOf(column);

      const value =
        Number(
          parts[columnIndex]
        );

      series[column].push(
        Number.isFinite(value)
          ? value
          : null
      );
    });
  }

  const years =
    Array.from(
      new Set(
        dates
          .map(
            (date) =>
              Number(
                String(date)
                  .slice(0, 4)
              )
          )
          .filter(
            Number.isFinite
          )
      )
    ).sort(
      (a, b) => a - b
    );

  const colByNorm = {};

  columns.forEach((column) => {
    colByNorm[
      normalizeKey(column)
    ] = column;
  });

  cacheObject[basinKey] = {
    dates,
    years,
    series,
    colByNorm
  };

  return cacheObject[
    basinKey
  ];
}


export async function loadObservedOnce(
  basinKey
) {
  return loadSeriesCsv(
    BASINS[basinKey]
      .observedCsv,
    observedCache,
    basinKey
  );
}


export async function loadSimulatedOnce(
  basinKey
) {
  return loadSeriesCsv(
    BASINS[basinKey]
      .simulatedCsv,
    simulatedCache,
    basinKey
  );
}


// ============================================================
// YEAR DROPDOWNS
// ============================================================

function fillYearDropdowns(
  years
) {
  const startSelect =
    el("startYear");

  const endSelect =
    el("endYear");

  if (
    !startSelect ||
    !endSelect
  ) {
    return;
  }

  startSelect.innerHTML = "";
  endSelect.innerHTML = "";

  years.forEach((year) => {
    const startOption =
      document.createElement(
        "option"
      );

    startOption.value =
      String(year);

    startOption.textContent =
      String(year);

    startSelect.appendChild(
      startOption
    );

    const endOption =
      document.createElement(
        "option"
      );

    endOption.value =
      String(year);

    endOption.textContent =
      String(year);

    endSelect.appendChild(
      endOption
    );
  });

  const lastYear =
    years[
      years.length - 1
    ];

  const secondLastYear =
    years.length >= 2
      ? years[
          years.length - 2
        ]
      : lastYear;

  startSelect.value =
    String(secondLastYear);

  endSelect.value =
    String(lastYear);
}


// ============================================================
// SEASONAL VALUES
// ============================================================

function formatStream(value) {
  return value === null
    ? "—"
    : `${Math.round(value)} ${UNIT_LABEL}`;
}


function updateSeasonBoxes(
  dates,
  values
) {
  const dryValues = [];
  const wetValues = [];
  const allValues = [];

  for (
    let i = 0;
    i < dates.length;
    i++
  ) {
    const month =
      monthFromDateStr(
        dates[i]
      );

    const value =
      values[i];

    if (
      !Number.isFinite(value)
    ) {
      continue;
    }

    allValues.push(value);

    if (
      DRY_MONTHS.has(month)
    ) {
      dryValues.push(value);
    }

    if (
      WET_MONTHS.has(month)
    ) {
      wetValues.push(value);
    }
  }

  if (el("dry")) {
    el("dry").textContent =
      formatStream(
        avg(dryValues)
      );
  }

  if (el("wet")) {
    el("wet").textContent =
      formatStream(
        avg(wetValues)
      );
  }

  if (el("annual")) {
    el("annual").textContent =
      formatStream(
        avg(allValues)
      );
  }
}


// ============================================================
// PANEL TEXT
// ============================================================

function updateTimeFrameText(
  stationName,
  startDate,
  endDate,
  startYear,
  endYear
) {
  if (el("panelSubtitle")) {
    el("panelSubtitle")
      .textContent =
      `${stationName} • ${startDate} to ${endDate}`;
  }

  if (el("chartTitle")) {
    el("chartTitle")
      .textContent =
      `Daily Streamflow (${startYear}-${endYear}) • ${UNIT_LABEL}`;
  }

  if (el("trendTitle")) {
    el("trendTitle")
      .textContent =
      `Trend (${startYear}-${endYear})`;
  }
}


// ============================================================
// OBSERVED / SIMULATED LINE SELECTOR
// ============================================================

export function applyLineMode() {
  const streamflowChart =
    initStreamflowChart();

  if (!streamflowChart) {
    return;
  }

  const mode =
    el("lineMode")?.value ||
    "both";

  if (mode === "both") {
    streamflowChart
      .setDatasetVisibility(
        0,
        true
      );

    streamflowChart
      .setDatasetVisibility(
        1,
        true
      );
  }

  else if (
    mode === "observed"
  ) {
    streamflowChart
      .setDatasetVisibility(
        0,
        true
      );

    streamflowChart
      .setDatasetVisibility(
        1,
        false
      );
  }

  else if (
    mode === "simulated"
  ) {
    streamflowChart
      .setDatasetVisibility(
        0,
        false
      );

    streamflowChart
      .setDatasetVisibility(
        1,
        true
      );
  }

  streamflowChart.update();
}


// ============================================================
// UPDATE DAILY STREAMFLOW FOR STATION
// ============================================================

export async function updateChartForStation(
  basinKey,
  stationName
) {
  try {
    const [
      observed,
      simulated
    ] = await Promise.all([
      loadObservedOnce(
        basinKey
      ),

      loadSimulatedOnce(
        basinKey
      )
    ]);

    const streamflowChart =
      initStreamflowChart();

    if (!streamflowChart) {
      return;
    }

    // Use years available from BOTH datasets.
    const years =
      Array.from(
        new Set([
          ...(
            observed?.years ||
            []
          ),

          ...(
            simulated?.years ||
            []
          )
        ])
      )
        .map(Number)
        .filter(
          Number.isFinite
        )
        .sort(
          (a, b) =>
            a - b
        );

    const startSelect =
      el("startYear");

    const endSelect =
      el("endYear");

    if (
      !startSelect ||
      !endSelect
    ) {
      return;
    }

    if (!years.length) {
      startSelect.innerHTML =
        "";

      endSelect.innerHTML =
        "";

      streamflowChart
        .data.labels = [];

      streamflowChart
        .data.datasets[0]
        .data = [];

      streamflowChart
        .data.datasets[1]
        .data = [];

      streamflowChart.update();

      if (el("chartNote")) {
        el("chartNote")
          .textContent =
          "No years were found in the daily streamflow files.";
      }

      return;
    }

    if (
      startSelect
        .options.length === 0 ||
      endSelect
        .options.length === 0
    ) {
      fillYearDropdowns(
        years
      );
    }

    let startYear =
      Number(
        startSelect.value
      );

    let endYear =
      Number(
        endSelect.value
      );

    if (
      !Number.isFinite(
        startYear
      )
    ) {
      startYear =
        years.length >= 2
          ? years[
              years.length - 2
            ]
          : years[0];

      startSelect.value =
        String(startYear);
    }

    if (
      !Number.isFinite(
        endYear
      )
    ) {
      endYear =
        years[
          years.length - 1
        ];

      endSelect.value =
        String(endYear);
    }

    if (
      startYear > endYear
    ) {
      endYear =
        startYear;

      endSelect.value =
        String(endYear);
    }

    const observedColumn =
      resolveColumn(
        observed,
        stationName
      );

    const simulatedColumn =
      resolveColumn(
        simulated,
        stationName
      );

    if (
      !observedColumn &&
      !simulatedColumn
    ) {
      streamflowChart
        .data.labels = [];

      streamflowChart
        .data.datasets[0]
        .data = [];

      streamflowChart
        .data.datasets[1]
        .data = [];

      streamflowChart.update();

      if (el("chartNote")) {
        el("chartNote")
          .textContent =
          `No observed or simulated CSV columns found for "${stationName}".`;
      }

      return;
    }

    // Match observed and simulated data
    // by DATE instead of row position.
    const observedByDate =
      new Map();

    const simulatedByDate =
      new Map();

    if (observedColumn) {
      observed.dates.forEach(
        (date, index) => {
          observedByDate.set(
            String(date).trim(),
            observed
              .series[
                observedColumn
              ][index]
          );
        }
      );
    }

    if (simulatedColumn) {
      simulated.dates.forEach(
        (date, index) => {
          simulatedByDate.set(
            String(date).trim(),
            simulated
              .series[
                simulatedColumn
              ][index]
          );
        }
      );
    }

    const allDates =
      Array.from(
        new Set([
          ...observedByDate.keys(),
          ...simulatedByDate.keys()
        ])
      )
        .filter(
          (date) => {
            const year =
              Number(
                String(date)
                  .slice(0, 4)
              );

            return (
              Number.isFinite(
                year
              ) &&
              year >= startYear &&
              year <= endYear
            );
          }
        )
        .sort();

    const observedValues =
      allDates.map(
        (date) => {
          const value =
            observedByDate.get(
              date
            );

          return Number.isFinite(
            value
          )
            ? value
            : null;
        }
      );

    const simulatedValues =
      allDates.map(
        (date) => {
          const value =
            simulatedByDate.get(
              date
            );

          return Number.isFinite(
            value
          )
            ? value
            : null;
        }
      );

    streamflowChart
      .data.labels =
      allDates;

    streamflowChart
      .data.datasets[0]
      .data =
      observedValues;

    streamflowChart
      .data.datasets[1]
      .data =
      simulatedValues;

    applyLineMode();

    const hasObserved =
      observedValues.some(
        Number.isFinite
      );

    const hasSimulated =
      simulatedValues.some(
        Number.isFinite
      );

    // Prefer observed data for the trend boxes.
    // If observed is unavailable, use simulated.
    const trendSource =
      hasObserved
        ? observedValues
        : simulatedValues;

    updateSeasonBoxes(
      allDates,
      trendSource
    );

    const startDate =
      allDates[0] || "—";

    const endDate =
      allDates[
        allDates.length - 1
      ] || "—";

    updateTimeFrameText(
      stationName,
      startDate,
      endDate,
      startYear,
      endYear
    );

    // ========================================================
    // CHART NOTE
    // ========================================================

    if (el("chartNote")) {
      if (!allDates.length) {
        el("chartNote")
          .textContent =
          `No daily streamflow data found for ${stationName} between ${startYear} and ${endYear}.`;
      }

      else if (
        hasObserved &&
        hasSimulated
      ) {
        el("chartNote")
          .textContent =
          `Observed = blue • Simulated = red • Hover for daily values • ${UNIT_LABEL}`;
      }

      else if (
        hasObserved
      ) {
        el("chartNote")
          .textContent =
          `Observed streamflow available • Simulated data unavailable for this selection • ${UNIT_LABEL}`;
      }

      else if (
        hasSimulated
      ) {
        el("chartNote")
          .textContent =
          `Simulated streamflow available • Observed data unavailable for this selection • ${UNIT_LABEL}`;
      }

      else {
        el("chartNote")
          .textContent =
          "No streamflow values found for this selection.";
      }
    }

    // ========================================================
    // RAINFALL
    // ========================================================

    try {
      const meanRain =
        await getStationRainfall(
          basinKey,
          stationName,
          startYear,
          endYear
        );

      if (el("climate")) {
        el("climate")
          .textContent =
          meanRain === null
            ? "—"
            : `${Math.round(
                meanRain
              )} mm/yr`;
      }
    } catch (error) {
      console.error(
        "Rainfall update failed:",
        error
      );
    }
  }

  catch (error) {
    console.error(
      "Daily streamflow failed:",
      error
    );

    const streamflowChart =
      initStreamflowChart();

    if (streamflowChart) {
      streamflowChart
        .data.labels = [];

      streamflowChart
        .data.datasets[0]
        .data = [];

      streamflowChart
        .data.datasets[1]
        .data = [];

      streamflowChart.update();
    }

    if (el("chartNote")) {
      el("chartNote")
        .textContent =
        `Daily streamflow could not load: ${error.message}`;
    }
  }
}


// ============================================================
// CLEAR DAILY STREAMFLOW
// ============================================================

export function clearStreamflowChart() {
  const streamflowChart =
    initStreamflowChart();

  if (streamflowChart) {
    streamflowChart
      .data.labels = [];

    streamflowChart
      .data.datasets[0]
      .data = [];

    streamflowChart
      .data.datasets[1]
      .data = [];

    streamflowChart.update();
  }

  if (el("chartTitle")) {
    el("chartTitle")
      .textContent =
      "Daily Streamflow";
  }

  if (el("chartNote")) {
    el("chartNote")
      .textContent =
      "Click a station to load its chart.";
  }

  if (el("startYear")) {
    el("startYear")
      .innerHTML = "";
  }

  if (el("endYear")) {
    el("endYear")
      .innerHTML = "";
  }
}


// ============================================================
// DAILY STREAMFLOW CONTROLS
// ============================================================

export function setupStreamflowControls(
  getCurrentStation,
  getCurrentBasinKey
) {
  el("startYear")
    ?.addEventListener(
      "change",
      async () => {
        const stationName =
          getCurrentStation();

        if (!stationName) {
          return;
        }

        const startYear =
          Number(
            el("startYear")
              .value
          );

        const endYear =
          Number(
            el("endYear")
              .value
          );

        if (
          Number.isFinite(
            startYear
          ) &&
          Number.isFinite(
            endYear
          ) &&
          startYear > endYear
        ) {
          el("endYear")
            .value =
            String(startYear);
        }

        await updateChartForStation(
          getCurrentBasinKey(),
          stationName
        );
      }
    );


  el("endYear")
    ?.addEventListener(
      "change",
      async () => {
        const stationName =
          getCurrentStation();

        if (!stationName) {
          return;
        }

        const startYear =
          Number(
            el("startYear")
              .value
          );

        const endYear =
          Number(
            el("endYear")
              .value
          );

        if (
          Number.isFinite(
            startYear
          ) &&
          Number.isFinite(
            endYear
          ) &&
          endYear < startYear
        ) {
          el("startYear")
            .value =
            String(endYear);
        }

        await updateChartForStation(
          getCurrentBasinKey(),
          stationName
        );
      }
    );


  el("lineMode")
    ?.addEventListener(
      "change",
      () => {
        applyLineMode();
      }
    );
}


// ============================================================
// CHART RESIZE ACCESS
// ============================================================

export function resizeStreamflowChart() {
  if (chart) {
    chart.resize();
  }
}
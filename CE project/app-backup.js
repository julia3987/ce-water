(async function () {
  const UNIT_LABEL = "m³/s";

  const DRY_MONTHS = new Set([11, 12, 1, 2, 3, 4]);
  const WET_MONTHS = new Set([5, 6, 7, 8, 9, 10]);

  const REFORECAST_XLSX =
    "data/S2S-VIC-Res-v3_results_for_dashboard.xlsx";

  const BASINS = {
    irrawaddy: {
      key: "irrawaddy",
      label: "Irrawaddy Basin",
      riverName: "Irrawaddy",
      boundary: "data/Irrawaddy_river_basin_boundary.geojson",
      riverLine: "data/Irrawaddy_river_line.geojson",
      stations: "data/Irrawaddy_flow_stations.geojson",
      observedCsv: "data/Observation_Irrawaddy.csv",
      simulatedCsv: "data/Simulation_Irrawaddy.csv",
      rainfallCsv: "data/Annual_rainfall_Irrawaddy.csv",
      landcoverCsv: "data/Landcover_Irrawaddy.csv",
      damsCsv: "data/Irrawaddy_dams.csv"
    },

    mekong: {
      key: "mekong",
      label: "Mekong Basin",
      riverName: "Mekong",
      boundary: "data/Mekong_river_basin_boundary.geojson",
      riverLine: "data/Mekong_river_line.geojson",
      stations: "data/Mekong_flow_stations.geojson",
      observedCsv: "data/Observation_Mekong.csv",
      simulatedCsv: "data/Simulation_Mekong.csv",
      rainfallCsv: "data/Annual_rainfall_Mekong.csv",
      landcoverCsv: "data/Landcover_Mekong_all_types.csv",
      damsCsv: "data/Mekong_mainstream_dams.csv"
    }
  };

  const el = (id) => document.getElementById(id);

  function setStatus(msg) {
    const s = el("statusText");
    if (s) s.textContent = msg || "";
  }

  function setActiveTab(basinKey) {
    el("btnIrrawaddy")?.classList.toggle(
      "active",
      basinKey === "irrawaddy"
    );

    el("btnMekong")?.classList.toggle(
      "active",
      basinKey === "mekong"
    );
  }

  function normalizeKey(name) {
    return String(name ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w]/g, "");
  }

  function resolveColumn(cache, stationName) {
    if (!stationName || !cache) return null;

    if (cache.series?.[stationName] !== undefined) {
      return stationName;
    }

    const underscored = String(stationName)
      .trim()
      .replace(/\s+/g, "_");

    if (cache.series?.[underscored] !== undefined) {
      return underscored;
    }

    const norm = normalizeKey(stationName);

    return cache.colByNorm?.[norm] ?? null;
  }

  function showStationSidebar() {
    if (el("stationSections")) {
      el("stationSections").style.display = "block";
    }

    if (el("damSection")) {
      el("damSection").style.display = "none";
    }
  }

  function showDamSidebar() {
    if (el("stationSections")) {
      el("stationSections").style.display = "none";
    }

    if (el("damSection")) {
      el("damSection").style.display = "block";
    }
  }

  function updateChartSources(basinKey) {
    const observedText =
      basinKey === "irrawaddy"
        ? "Observed streamflow (Irrawaddy): GRDC (Global Runoff Data Center)"
        : "Observed streamflow (Mekong): MRC (Mekong River Commission)";

    if (el("sourcesObserved")) {
      el("sourcesObserved").textContent = observedText;
    }

    if (el("sourcesPrecip")) {
      el("sourcesPrecip").textContent =
        "Precipitation: GPM IMERG (half-hourly and daily)";
    }

    if (el("sourcesDam")) {
      el("sourcesDam").textContent = "Dam: MSEA-Res";
    }

    if (el("sourcesLandcover")) {
      el("sourcesLandcover").textContent =
        "Land cover: SERVIR-SEA";
    }
  }

  // ============================================================
  // MAP
  // ============================================================

  const map = L.map("map");

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 19,
      attribution:
        "&copy; OpenStreetMap contributors &copy; CARTO"
    }
  ).addTo(map);

  let boundaryLayer = null;
  let riverLayer = null;
  let stationsLayer = null;
  let damLayer = null;
  let selectedMarker = null;

  let damsVisible = true;

  let currentStation = null;
  let currentBasinKey = "irrawaddy";

  function removeLayer(layer) {
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  }

  function toggleDams() {
    if (!damLayer) return;

    damsVisible = !damsVisible;

    if (damsVisible) {
      damLayer.addTo(map);

      if (el("toggleDamsBtn")) {
        el("toggleDamsBtn").textContent = "Hide dams";
      }
    } else {
      removeLayer(damLayer);

      if (el("toggleDamsBtn")) {
        el("toggleDamsBtn").textContent = "Show dams";
      }
    }
  }

  async function fetchGeojson(url) {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Could not load: ${url}`);
    }

    return await res.json();
  }

  // ============================================================
  // CACHES
  // ============================================================

  const observedCache = {};
  const simulatedCache = {};
  const rainfallCache = {};
  const landcoverCache = {};
  const damCache = {};

  let reforecastWorkbook = null;
  const reforecastRowsCache = {};

  // ============================================================
  // CHART VARIABLES
  // ============================================================

  let chart = null;
  let landcoverChart = null;
  let forecastChart = null;
  let archivedChart = null;

  // ============================================================
  // DAILY STREAMFLOW CHART
  // ============================================================

  function initChartIfNeeded() {
    if (chart) return chart;

    const canvas = el("stationChart");
    if (!canvas) return null;

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
              title: (items) => items?.[0]?.label || "",

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
  // LAND COVER CHART
  // ============================================================

  function initLandcoverChart() {
    if (landcoverChart) return landcoverChart;

    const canvas = el("landcoverChart");
    if (!canvas) return null;

    landcoverChart = new Chart(canvas, {
      type: "doughnut",

      data: {
        labels: [],

        datasets: [
          {
            data: [],
            backgroundColor: [],
            borderColor: "#ffffff",
            borderWidth: 2
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            position: "bottom"
          },

          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.label}: ${ctx.parsed.toFixed(1)}%`
            }
          }
        },

        cutout: "55%"
      }
    });

    return landcoverChart;
  }

  // ============================================================
  // FORECAST CHART
  // ============================================================

  function initForecastChart() {
    if (forecastChart) return forecastChart;

    const canvas = el("forecastChart");
    if (!canvas) return null;

    forecastChart = new Chart(canvas, {
      type: "line",

      data: {
        labels: [],

        datasets: [
          {
            label: "Forecast",
            data: [],
            borderColor: "#0b3d91",
            backgroundColor: "#0b3d91",
            borderDash: [8, 6],
            tension: 0.28,
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 3,
            fill: false
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
          legend: {
            display: true
          },

          tooltip: {
            callbacks: {
              label: (ctx) => {
                const y = ctx.parsed.y;

                return `Forecast: ${Math.round(y)} ${UNIT_LABEL}`;
              }
            }
          }
        },

        scales: {
          x: {
            title: {
              display: true,
              text: "Forecast day"
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

    return forecastChart;
  }

  // ============================================================
  // RETROSPECTIVE REFORECAST CHART
  // ============================================================

  function initArchivedChart() {
    if (archivedChart) return archivedChart;

    const canvas = el("archivedChart");
    if (!canvas) return null;

    archivedChart = new Chart(canvas, {
      type: "line",

      data: {
        labels: [],

        datasets: [
          {
            label: "Ensemble minimum",
            data: [],
            borderColor: "rgba(37, 99, 235, 0)",
            backgroundColor: "rgba(37, 99, 235, 0)",
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 0,
            tension: 0.2,
            fill: false
          },

          {
            label: "5-member ensemble range",
            data: [],
            borderColor: "rgba(37, 99, 235, 0.35)",
            backgroundColor: "rgba(37, 99, 235, 0.18)",
            pointRadius: 0,
            pointHoverRadius: 0,
            borderWidth: 1,
            tension: 0.2,
            fill: "-1"
          },

          {
            label: "Ensemble mean",
            data: [],
            borderColor: "#0b3d91",
            backgroundColor: "#0b3d91",
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 3,
            tension: 0.2,
            fill: false
          }
        ]
      },

      options: {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
          mode: "index",
          intersect: false
        },

        plugins: {
          legend: {
            display: true,

            labels: {
              filter: (item) => item.datasetIndex !== 0
            }
          },

          tooltip: {
            callbacks: {
              title: (items) => items?.[0]?.label || "",

              label: (ctx) => {
                if (ctx.datasetIndex === 0) {
                  return null;
                }

                const index = ctx.dataIndex;

                const minValue =
                  archivedChart.data.datasets[0].data[index];

                const maxValue =
                  archivedChart.data.datasets[1].data[index];

                const meanValue =
                  archivedChart.data.datasets[2].data[index];

                if (ctx.datasetIndex === 1) {
                  if (
                    !Number.isFinite(minValue) ||
                    !Number.isFinite(maxValue)
                  ) {
                    return null;
                  }

                  return `Ensemble range: ${Math.round(
                    minValue
                  )}–${Math.round(maxValue)} ${UNIT_LABEL}`;
                }

                if (ctx.datasetIndex === 2) {
                  return `Ensemble mean: ${
                    Number.isFinite(meanValue)
                      ? Math.round(meanValue)
                      : "—"
                  } ${UNIT_LABEL}`;
                }

                return null;
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
              text: "Forecast date"
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

    return archivedChart;
  }

  // ============================================================
  // FORECAST PLACEHOLDER — UNCHANGED
  // ============================================================

  function generatePlaceholderForecast(stationName) {
    const labels = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
    const seed = stationName
      .split("")
      .reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

    const base = 180 + (seed % 220);

    const values = [
      base,
      base + 12,
      base + 28,
      base + 18,
      base + 36,
      base + 20,
      base + 30
    ];

    return { labels, values };
  }

  function openFloatingPanel(basinKey, stationName) {
    const panel = el("floatingPanel");
    const fc = initForecastChart();

    if (!panel || !fc) return;

    const preview = generatePlaceholderForecast(stationName);

    if (el("floatingTitle")) {
      el("floatingTitle").textContent = stationName;
    }

    if (el("floatingSubtitle")) {
      el("floatingSubtitle").textContent =
        `${BASINS[basinKey].label} • forecast and retrospective reforecast`;
    }

    fc.data.labels = preview.labels;
    fc.data.datasets[0].data = preview.values;
    fc.update();

    panel.classList.remove("hidden");
    panel.classList.remove("minimized");

    setActiveFloatingTab("forecast");
  }

  function closeFloatingPanel() {
    el("floatingPanel")?.classList.add("hidden");
  }

  function toggleMinimizeFloatingPanel() {
    el("floatingPanel")?.classList.toggle("minimized");
  }

  function setActiveFloatingTab(tabName) {
    const isForecast = tabName === "forecast";

    if (el("forecastView")) {
      el("forecastView").style.display =
        isForecast ? "block" : "none";
    }

    if (el("archivedView")) {
      el("archivedView").style.display =
        isForecast ? "none" : "block";
    }

    el("tabForecast")?.classList.toggle("active", isForecast);
    el("tabArchived")?.classList.toggle("active", !isForecast);
  }

  // ============================================================
  // DATE NORMALIZATION
  // ============================================================

  function normalizeDate(dateString) {
    const raw = String(dateString ?? "").trim();

    if (!raw) return "";

    // YYYY-MM-DD
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
      const [year, month, day] = raw.split("-");

      return `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;
    }

    // M/D/YYYY or MM/DD/YYYY
    // This fixes Simulation_Mekong.csv
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
      const [month, day, year] = raw.split("/");

      return `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;
    }

    const parsed = new Date(raw);

    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();

      const month = String(
        parsed.getMonth() + 1
      ).padStart(2, "0");

      const day = String(
        parsed.getDate()
      ).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }

    return raw;
  }

  // ============================================================
  // STREAMFLOW CSV
  // ============================================================

  async function loadSeriesCsv(url, cacheObj, basinKey) {
    if (cacheObj[basinKey]) {
      return cacheObj[basinKey];
    }

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Could not load CSV: ${url}`);
    }

    const text = await res.text();

    const lines = text
      .trim()
      .split(/\r?\n/);

    const header = lines[0]
      .split(",")
      .map((s) => s.trim());

    const dateIdx = header.indexOf("Date");

    if (dateIdx === -1) {
      throw new Error(`CSV must have a "Date" column`);
    }

    const cols = header.filter((h) => h !== "Date");

    const dates = [];
    const series = {};

    cols.forEach((c) => {
      series[c] = [];
    });

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");

      const rawDate = parts[dateIdx];

      // IMPORTANT:
      // Converts Mekong dates like 1/1/2001
      // into 2001-01-01.
      const date = normalizeDate(rawDate);

      if (!date) continue;

      dates.push(date);

      cols.forEach((c) => {
        const colIdx = header.indexOf(c);

        const v = Number(parts[colIdx]);

        series[c].push(
          Number.isFinite(v)
            ? v
            : null
        );
      });
    }

    const years = Array.from(
      new Set(
        dates
          .map((date) =>
            Number(String(date).slice(0, 4))
          )
          .filter(Number.isFinite)
      )
    ).sort((a, b) => a - b);

    const colByNorm = {};

    cols.forEach((c) => {
      colByNorm[normalizeKey(c)] = c;
    });

    cacheObj[basinKey] = {
      dates,
      years,
      series,
      colByNorm
    };

    return cacheObj[basinKey];
  }

  async function loadObservedOnce(basinKey) {
    return loadSeriesCsv(
      BASINS[basinKey].observedCsv,
      observedCache,
      basinKey
    );
  }

  async function loadSimulatedOnce(basinKey) {
    return loadSeriesCsv(
      BASINS[basinKey].simulatedCsv,
      simulatedCache,
      basinKey
    );
  }

  // ============================================================
  // REFORECAST XLSX
  // ============================================================

  async function loadReforecastWorkbookOnce() {
    if (reforecastWorkbook) {
      return reforecastWorkbook;
    }

    if (typeof XLSX === "undefined") {
      throw new Error(
        "SheetJS did not load. Check the XLSX script in index.html."
      );
    }

    const res = await fetch(REFORECAST_XLSX);

    if (!res.ok) {
      throw new Error(
        `Could not load reforecast workbook: ${REFORECAST_XLSX}`
      );
    }

    const buffer = await res.arrayBuffer();

    reforecastWorkbook = XLSX.read(buffer, {
      type: "array"
    });

    return reforecastWorkbook;
  }

  function resolveReforecastSheetName(workbook, stationName) {
    if (!workbook || !stationName) {
      return null;
    }

    if (workbook.SheetNames.includes(stationName)) {
      return stationName;
    }

    const normalizedStation = normalizeKey(stationName);

    return (
      workbook.SheetNames.find(
        (sheetName) =>
          normalizeKey(sheetName) === normalizedStation
      ) || null
    );
  }

  async function loadReforecastRowsForStation(stationName) {
    const cacheKey = normalizeKey(stationName);

    if (reforecastRowsCache[cacheKey]) {
      return reforecastRowsCache[cacheKey];
    }

    const workbook = await loadReforecastWorkbookOnce();

    const sheetName = resolveReforecastSheetName(
      workbook,
      stationName
    );

    if (!sheetName) {
      throw new Error(
        `No worksheet found for station "${stationName}".`
      );
    }

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: true
    });

    reforecastRowsCache[cacheKey] = rows;

    return rows;
  }

  function monthName(monthNumber) {
    const names = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December"
    ];

    return names[Number(monthNumber) - 1] || String(monthNumber);
  }

  function fillReforecastYears(rows) {
    const select = el("archivedYear");

    if (!select) return [];

    const years = Array.from(
      new Set(
        rows
          .map((row) => Number(row.Year))
          .filter(Number.isFinite)
      )
    ).sort((a, b) => a - b);

    const previous = Number(select.value);

    select.innerHTML = "";

    years.forEach((year) => {
      const option = document.createElement("option");

      option.value = String(year);
      option.textContent = String(year);

      select.appendChild(option);
    });

    if (years.includes(previous)) {
      select.value = String(previous);
    } else if (years.length) {
      select.value = String(years[years.length - 1]);
    }

    return years;
  }

  function fillReforecastMonths(rows, selectedYear) {
    const select = el("archivedMonth");

    if (!select) return [];

    const months = Array.from(
      new Set(
        rows
          .filter(
            (row) =>
              Number(row.Year) === Number(selectedYear)
          )
          .map((row) => Number(row.Month))
          .filter(
            (month) =>
              Number.isFinite(month) &&
              month >= 1 &&
              month <= 12
          )
      )
    ).sort((a, b) => a - b);

    const previous = Number(select.value);

    select.innerHTML = "";

    months.forEach((month) => {
      const option = document.createElement("option");

      option.value = String(month);
      option.textContent = monthName(month);

      select.appendChild(option);
    });

    if (months.includes(previous)) {
      select.value = String(previous);
    } else if (months.length) {
      select.value = String(months[0]);
    }

    return months;
  }

  function formatReforecastDate(row) {
    const year = Number(row.Year);
    const month = Number(row.Month);
    const day = Number(row.Day);

    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day)
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;
    }

    return String(row.Date ?? "");
  }

  // ============================================================
  // YEAR DROPDOWNS
  // ============================================================

  function fillYearDropdowns(years) {
    const startSel = el("startYear");
    const endSel = el("endYear");

    if (!startSel || !endSel) return;

    startSel.innerHTML = "";
    endSel.innerHTML = "";

    years.forEach((year) => {
      const a = document.createElement("option");
      a.value = String(year);
      a.textContent = String(year);
      startSel.appendChild(a);

      const b = document.createElement("option");
      b.value = String(year);
      b.textContent = String(year);
      endSel.appendChild(b);
    });

    const last = years[years.length - 1];

    const secondLast =
      years.length >= 2
        ? years[years.length - 2]
        : last;

    startSel.value = String(secondLast);
    endSel.value = String(last);
  }

  function avg(nums) {
    let sum = 0;
    let n = 0;

    for (const v of nums) {
      if (!Number.isFinite(v)) continue;

      sum += v;
      n++;
    }

    return n ? sum / n : null;
  }

  function monthFromDateStr(dateStr) {
    return Number(String(dateStr).slice(5, 7));
  }

  function formatStream(v) {
    return v === null
      ? "—"
      : `${Math.round(v)} ${UNIT_LABEL}`;
  }

  function updateSeasonBoxes(datesSlice, valuesSlice) {
    const dryVals = [];
    const wetVals = [];
    const allVals = [];

    for (let i = 0; i < datesSlice.length; i++) {
      const month = monthFromDateStr(datesSlice[i]);
      const value = valuesSlice[i];

      if (!Number.isFinite(value)) continue;

      allVals.push(value);

      if (DRY_MONTHS.has(month)) {
        dryVals.push(value);
      }

      if (WET_MONTHS.has(month)) {
        wetVals.push(value);
      }
    }

    if (el("dry")) {
      el("dry").textContent = formatStream(avg(dryVals));
    }

    if (el("wet")) {
      el("wet").textContent = formatStream(avg(wetVals));
    }

    if (el("annual")) {
      el("annual").textContent = formatStream(avg(allVals));
    }
  }

  // ============================================================
  // RAINFALL
  // ============================================================

  async function loadAnnualRainfallOnce(basinKey) {
    const cfg = BASINS[basinKey];

    if (!cfg?.rainfallCsv) return null;

    if (rainfallCache[basinKey]) {
      return rainfallCache[basinKey];
    }

    const res = await fetch(cfg.rainfallCsv);

    if (!res.ok) {
      throw new Error(
        `Could not load rainfall CSV: ${cfg.rainfallCsv}`
      );
    }

    const text = await res.text();

    const lines = text.trim().split(/\r?\n/);

    const header = lines[0]
      .split(",")
      .map((s) => s.trim());

    const yearIdx = header.indexOf("Year");

    if (yearIdx === -1) {
      throw new Error(
        `Rainfall CSV must have a "Year" column`
      );
    }

    const cols = header.filter((h) => h !== "Year");

    const years = [];
    const series = {};

    cols.forEach((c) => {
      series[c] = [];
    });

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");

      const year = Number(parts[yearIdx]);

      if (!Number.isFinite(year)) continue;

      years.push(year);

      cols.forEach((c) => {
        const colIdx = header.indexOf(c);
        const value = Number(parts[colIdx]);

        series[c].push(
          Number.isFinite(value)
            ? value
            : null
        );
      });
    }

    const colByNorm = {};

    cols.forEach((c) => {
      colByNorm[normalizeKey(c)] = c;
    });

    rainfallCache[basinKey] = {
      years,
      series,
      colByNorm
    };

    return rainfallCache[basinKey];
  }

  function avgRainInRange(
    rainCache,
    colName,
    startYear,
    endYear
  ) {
    const vals = [];

    for (let i = 0; i < rainCache.years.length; i++) {
      const year = rainCache.years[i];

      if (year < startYear || year > endYear) continue;

      const value = rainCache.series[colName][i];

      if (Number.isFinite(value)) {
        vals.push(value);
      }
    }

    return avg(vals);
  }

  // ============================================================
  // LAND COVER
  // ============================================================

  async function loadLandcoverOnce(basinKey) {
    const cfg = BASINS[basinKey];

    if (!cfg?.landcoverCsv) return null;

    if (landcoverCache[basinKey]) {
      return landcoverCache[basinKey];
    }

    const res = await fetch(cfg.landcoverCsv);

    if (!res.ok) {
      throw new Error(
        `Could not load landcover CSV: ${cfg.landcoverCsv}`
      );
    }

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);

    const header = lines[0]
      .split(",")
      .map((s) => s.trim());

    const bySubbasin = {};

    if (
      header.includes("Subbasin") &&
      header.includes("Landcover") &&
      header.includes("Percentage")
    ) {
      const idxSub = header.indexOf("Subbasin");
      const idxType = header.indexOf("Landcover");
      const idxPct = header.indexOf("Percentage");

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");

        const sub = parts[idxSub]?.trim();
        const lc = parts[idxType]?.trim();
        const pct = Number(parts[idxPct]);

        if (!sub || !lc || !Number.isFinite(pct)) continue;

        const key = normalizeKey(sub);

        if (!bySubbasin[key]) {
          bySubbasin[key] = {
            labels: [],
            values: []
          };
        }

        bySubbasin[key].labels.push(lc);
        bySubbasin[key].values.push(pct);
      }
    } else if (header[0] === "Landcover") {
      const stationCols = header.slice(1);

      stationCols.forEach((station) => {
        const key = normalizeKey(station);

        bySubbasin[key] = {
          labels: [],
          values: []
        };
      });

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(",");

        const lcType = parts[0]?.trim();

        if (!lcType) continue;

        for (let j = 1; j < header.length; j++) {
          const station = header[j];
          const key = normalizeKey(station);
          const pct = Number(parts[j]);

          if (!Number.isFinite(pct)) continue;

          bySubbasin[key].labels.push(lcType);
          bySubbasin[key].values.push(pct);
        }
      }
    } else {
      throw new Error(
        `Unsupported landcover CSV format in ${cfg.landcoverCsv}`
      );
    }

    landcoverCache[basinKey] = {
      bySubbasin
    };

    return landcoverCache[basinKey];
  }

  async function updateLandcoverForStation(
    basinKey,
    stationName
  ) {
    const c = initLandcoverChart();
    const fallback = el("landcoverFallback");

    if (!c || !fallback) return;

    let top3El = document.getElementById("landcoverTop3");

    if (!top3El) {
      top3El = document.createElement("div");

      top3El.id = "landcoverTop3";
      top3El.className = "smallNote";
      top3El.style.marginTop = "10px";

      const card = c.canvas.closest(".card");

      if (card) {
        card.appendChild(top3El);
      }
    }

    fallback.style.display = "none";
    fallback.textContent = "";
    top3El.innerHTML = "";

    c.data.labels = [];
    c.data.datasets[0].data = [];
    c.data.datasets[0].backgroundColor = [];
    c.update();

    try {
      const cache = await loadLandcoverOnce(basinKey);

      if (!cache) {
        fallback.style.display = "block";
        fallback.textContent =
          "Land cover not available for this basin yet.";
        return;
      }

      const key = normalizeKey(stationName);

      let entry = cache.bySubbasin[key];

      if (!entry) {
        const possibleMatch = Object.keys(
          cache.bySubbasin
        ).find(
          (k) =>
            k.includes(key) ||
            key.includes(k)
        );

        if (possibleMatch) {
          entry = cache.bySubbasin[possibleMatch];
        }
      }

      if (!entry) {
        fallback.style.display = "block";
        fallback.textContent =
          `No land cover data found for: ${stationName}`;
        return;
      }

      const pairs = entry.labels
        .map((label, index) => ({
          label,
          value: Number(entry.values[index])
        }))
        .filter(
          (pair) =>
            pair.label &&
            Number.isFinite(pair.value) &&
            pair.value > 0
        );

      const total = pairs.reduce(
        (sum, pair) => sum + pair.value,
        0
      );

      if (!total) {
        fallback.style.display = "block";
        fallback.textContent =
          `Land cover values are all zero for: ${stationName}`;
        return;
      }

      pairs.forEach((pair) => {
        pair.pct = (pair.value / total) * 100;
      });

      pairs.sort((a, b) => b.pct - a.pct);

      const top3 = pairs.slice(0, 3);

      const otherPct = pairs
        .slice(3)
        .reduce(
          (sum, pair) => sum + pair.pct,
          0
        );

      const finalLabels = [
        ...top3.map((pair) => pair.label)
      ];

      const finalData = [
        ...top3.map((pair) => pair.pct)
      ];

      if (otherPct > 0.01) {
        finalLabels.push("Other");
        finalData.push(otherPct);
      }

      const colorByClass = {
        Forest: "#2E7D32",
        Agriculture: "#F9A825",
        Shrub: "#8D6E63",
        Urban: "#616161",
        Water: "#1E88E5",
        Grass: "#7CB342",
        Snow: "#90CAF9",
        Barren: "#BDBDBD",
        Other: "#B0BEC5"
      };

      const defaultPalette = [
        "#2E7D32",
        "#F9A825",
        "#8D6E63",
        "#1E88E5",
        "#7CB342",
        "#616161",
        "#90CAF9",
        "#BDBDBD"
      ];

      const colors = finalLabels.map(
        (label, index) =>
          colorByClass[label] ||
          defaultPalette[index % defaultPalette.length]
      );

      c.data.labels = finalLabels;
      c.data.datasets[0].data = finalData;
      c.data.datasets[0].backgroundColor = colors;

      c.update();

      top3El.innerHTML = `
        <div style="font-weight:600; margin-bottom:6px;">Top land cover</div>
        <div>1) ${
          top3[0]
            ? `${top3[0].label} — ${top3[0].pct.toFixed(1)}%`
            : "—"
        }</div>
        <div>2) ${
          top3[1]
            ? `${top3[1].label} — ${top3[1].pct.toFixed(1)}%`
            : "—"
        }</div>
        <div>3) ${
          top3[2]
            ? `${top3[2].label} — ${top3[2].pct.toFixed(1)}%`
            : "—"
        }</div>
      `;
    } catch (error) {
      fallback.style.display = "block";

      fallback.textContent =
        "Land cover file didn’t load (check your CSV path).";

      console.error(error);
    }
  }

  // ============================================================
  // DAMS
  // ============================================================

  async function loadDamCsvOnce(basinKey) {
    if (damCache[basinKey]) {
      return damCache[basinKey];
    }

    const file = BASINS[basinKey].damsCsv;

    const res = await fetch(file);

    if (!res.ok) {
      throw new Error(`Could not load dam CSV: ${file}`);
    }

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);

    const header = lines[0]
      .split(",")
      .map((s) => s.trim());

    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");

      const row = {};

      header.forEach((heading, index) => {
        row[heading] = parts[index];
      });

      rows.push(row);
    }

    damCache[basinKey] = rows;

    return rows;
  }

  function clearDamCard() {
    if (el("damName")) el("damName").textContent = "—";

    if (el("damRiverText")) {
      el("damRiverText").textContent = "River basin dam";
    }

    if (el("damYear")) el("damYear").textContent = "—";
    if (el("damCapacity")) el("damCapacity").textContent = "—";
    if (el("damVolume")) el("damVolume").textContent = "—";
    if (el("damCapacityMini")) el("damCapacityMini").textContent = "—";

    if (el("capacityFill")) {
      el("capacityFill").style.width = "0%";
    }
  }

  function updateDamCard(dam) {
    showDamSidebar();

    if (el("stationNameText")) {
      el("stationNameText").textContent = "—";
    }

    const capacity = Number(dam["Capacity (MW)"]);

    const percent = Number.isFinite(capacity)
      ? Math.min((capacity / 3000) * 100, 100)
      : 0;

    if (el("panelTitle")) {
      el("panelTitle").textContent =
        `${dam["Dam"] || "Dam"} 🏗️`;
    }

    if (el("panelSubtitle")) {
      el("panelSubtitle").textContent = "Dam details";
    }

    if (el("damName")) {
      el("damName").textContent = dam["Dam"] || "—";
    }

    if (el("damRiverText")) {
      el("damRiverText").textContent =
        `${BASINS[currentBasinKey].label} • hydropower dam`;
    }

    if (el("damYear")) {
      el("damYear").textContent =
        dam["Year of commission"] || "—";
    }

    if (el("damCapacity")) {
      el("damCapacity").textContent =
        dam["Capacity (MW)"]
          ? `${dam["Capacity (MW)"]} MW`
          : "—";
    }

    if (el("damVolume")) {
      el("damVolume").textContent =
        dam["Reservoir volume (km3)"]
          ? `${dam["Reservoir volume (km3)"]} km³`
          : "—";
    }

    if (el("damCapacityMini")) {
      el("damCapacityMini").textContent =
        dam["Capacity (MW)"]
          ? `${dam["Capacity (MW)"]} MW`
          : "—";
    }

    if (el("capacityFill")) {
      el("capacityFill").style.width = `${percent}%`;
    }
  }

  function damIconSizeFromCapacity(capacity) {
    const c = Number(capacity);

    if (!Number.isFinite(c) || c <= 0) return 12;
    if (c < 50) return 12;
    if (c < 200) return 14;
    if (c < 500) return 16;
    if (c < 1000) return 18;

    return 20;
  }

  function createDamIcon(capacity) {
    const size = damIconSizeFromCapacity(capacity);

    return L.icon({
      iconUrl: "damicon.png",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  async function loadDamLayer(basinKey) {
    if (damLayer) {
      removeLayer(damLayer);
    }

    const rows = await loadDamCsvOnce(basinKey);

    damLayer = L.layerGroup();

    rows.forEach((dam) => {
      const lat = Number(dam["Latitude"]);
      const lon = Number(dam["Longitude"]);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }

      const marker = L.marker([lat, lon], {
        icon: createDamIcon(dam["Capacity (MW)"])
      });

      marker.bindTooltip(
        `<div style="font-size:13px; font-weight:600;">${
          dam["Dam"] || "Dam"
        }</div>`,
        {
          sticky: true,
          direction: "top",
          opacity: 0.95
        }
      );

      marker.on("click", () => {
        updateDamCard(dam);
        map.setView([lat, lon], 7);
      });

      marker.addTo(damLayer);
    });

    if (damsVisible) {
      damLayer.addTo(map);
    }
  }

  // ============================================================
  // SIDEBAR RESET
  // ============================================================

  function clearSidebarAndCharts() {
    showStationSidebar();

    if (el("panelTitle")) {
      el("panelTitle").textContent = "Click a station 📍";
    }

    if (el("panelSubtitle")) {
      el("panelSubtitle").textContent =
        "Hover or click a station to see details.";
    }

    if (el("stationNameText")) {
      el("stationNameText").textContent = "—";
    }

    if (el("river")) el("river").textContent = "—";
    if (el("climate")) el("climate").textContent = "—";

    if (el("trendTitle")) {
      el("trendTitle").textContent = "Trend (—)";
    }

    if (el("dry")) el("dry").textContent = "—";
    if (el("wet")) el("wet").textContent = "—";
    if (el("annual")) el("annual").textContent = "—";

    clearDamCard();

    const c = initChartIfNeeded();

    if (c) {
      c.data.labels = [];
      c.data.datasets[0].data = [];
      c.data.datasets[1].data = [];
      c.update();
    }

    if (el("chartTitle")) {
      el("chartTitle").textContent = "Daily Streamflow";
    }

    if (el("chartNote")) {
      el("chartNote").textContent =
        "Click a station to load its chart.";
    }

    const lc = initLandcoverChart();

    if (lc) {
      lc.data.labels = [];
      lc.data.datasets[0].data = [];
      lc.data.datasets[0].backgroundColor = [];
      lc.update();
    }

    if (el("landcoverFallback")) {
      el("landcoverFallback").style.display = "none";
      el("landcoverFallback").textContent = "";
    }

    const top3El = document.getElementById("landcoverTop3");

    if (top3El) {
      top3El.innerHTML = "";
    }

    if (el("startYear")) {
      el("startYear").innerHTML = "";
    }

    if (el("endYear")) {
      el("endYear").innerHTML = "";
    }

    currentStation = null;
  }

  function updatePanelForStation(basinKey, stationName) {
    showStationSidebar();

    if (el("panelTitle")) {
      el("panelTitle").textContent = `${stationName} 📍`;
    }

    if (el("stationNameText")) {
      el("stationNameText").textContent = stationName;
    }

    if (el("river")) {
      el("river").textContent = BASINS[basinKey].riverName;
    }

    if (el("climate")) el("climate").textContent = "—";

    if (el("trendTitle")) {
      el("trendTitle").textContent = "Trend (—)";
    }

    if (el("dry")) el("dry").textContent = "—";
    if (el("wet")) el("wet").textContent = "—";
    if (el("annual")) el("annual").textContent = "—";
  }

  function updateTimeFrameText(
    stationName,
    startDate,
    endDate,
    startYear,
    endYear
  ) {
    if (el("panelSubtitle")) {
      el("panelSubtitle").textContent =
        `${stationName} • ${startDate} to ${endDate}`;
    }

    if (el("chartTitle")) {
      el("chartTitle").textContent =
        `Daily Streamflow (${startYear}-${endYear}) • ${UNIT_LABEL}`;
    }

    if (el("trendTitle")) {
      el("trendTitle").textContent =
        `Trend (${startYear}-${endYear})`;
    }
  }

  // ============================================================
  // LINE MODE
  // ============================================================

  function applyLineMode() {
    const c = initChartIfNeeded();

    if (!c) return;

    const mode = el("lineMode")?.value || "both";

    if (mode === "both") {
      c.setDatasetVisibility(0, true);
      c.setDatasetVisibility(1, true);
    } else if (mode === "observed") {
      c.setDatasetVisibility(0, true);
      c.setDatasetVisibility(1, false);
    } else if (mode === "simulated") {
      c.setDatasetVisibility(0, false);
      c.setDatasetVisibility(1, true);
    }

    c.update();
  }

  // ============================================================
  // DAILY STREAMFLOW
  // ============================================================

  async function updateChartForStation(basinKey, stationName) {
    currentStation = stationName;

    try {
      const [observed, simulated] = await Promise.all([
        loadObservedOnce(basinKey),
        loadSimulatedOnce(basinKey)
      ]);

      const c = initChartIfNeeded();

      if (!c) return;

      const years = Array.from(
        new Set([
          ...(observed?.years || []),
          ...(simulated?.years || [])
        ])
      )
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);

      const startSelect = el("startYear");
      const endSelect = el("endYear");

      if (!startSelect || !endSelect) return;

      if (!years.length) {
        startSelect.innerHTML = "";
        endSelect.innerHTML = "";

        c.data.labels = [];
        c.data.datasets[0].data = [];
        c.data.datasets[1].data = [];
        c.update();

        el("chartNote").textContent =
          "No years were found in the daily streamflow files.";

        return;
      }

      if (
        startSelect.options.length === 0 ||
        endSelect.options.length === 0
      ) {
        fillYearDropdowns(years);
      }

      let startYear = Number(startSelect.value);
      let endYear = Number(endSelect.value);

      if (!Number.isFinite(startYear)) {
        startYear =
          years.length >= 2
            ? years[years.length - 2]
            : years[0];

        startSelect.value = String(startYear);
      }

      if (!Number.isFinite(endYear)) {
        endYear = years[years.length - 1];
        endSelect.value = String(endYear);
      }

      if (startYear > endYear) {
        endYear = startYear;
        endSelect.value = String(endYear);
      }

      const obsCol = resolveColumn(observed, stationName);
      const simCol = resolveColumn(simulated, stationName);

      if (!obsCol && !simCol) {
        c.data.labels = [];
        c.data.datasets[0].data = [];
        c.data.datasets[1].data = [];
        c.update();

        el("chartNote").textContent =
          `No observed or simulated CSV columns found for "${stationName}".`;

        return;
      }

      const observedByDate = new Map();
      const simulatedByDate = new Map();

      if (obsCol) {
        observed.dates.forEach((date, index) => {
          observedByDate.set(
            String(date).trim(),
            observed.series[obsCol][index]
          );
        });
      }

      if (simCol) {
        simulated.dates.forEach((date, index) => {
          simulatedByDate.set(
            String(date).trim(),
            simulated.series[simCol][index]
          );
        });
      }

      const allDates = Array.from(
        new Set([
          ...observedByDate.keys(),
          ...simulatedByDate.keys()
        ])
      )
        .filter((date) => {
          const year = Number(String(date).slice(0, 4));

          return (
            Number.isFinite(year) &&
            year >= startYear &&
            year <= endYear
          );
        })
        .sort();

      const observedValues = allDates.map((date) => {
        const value = observedByDate.get(date);

        return Number.isFinite(value)
          ? value
          : null;
      });

      const simulatedValues = allDates.map((date) => {
        const value = simulatedByDate.get(date);

        return Number.isFinite(value)
          ? value
          : null;
      });

      c.data.labels = allDates;
      c.data.datasets[0].data = observedValues;
      c.data.datasets[1].data = simulatedValues;

      applyLineMode();

      const hasObserved = observedValues.some(Number.isFinite);
      const hasSimulated = simulatedValues.some(Number.isFinite);

      const trendSource = hasObserved
        ? observedValues
        : simulatedValues;

      updateSeasonBoxes(
        allDates,
        trendSource
      );

      const startDate = allDates[0] || "—";

      const endDate =
        allDates[allDates.length - 1] || "—";

      updateTimeFrameText(
        stationName,
        startDate,
        endDate,
        startYear,
        endYear
      );

      if (!allDates.length) {
        el("chartNote").textContent =
          `No daily streamflow data found for ${stationName} between ${startYear} and ${endYear}.`;
      } else if (hasObserved && hasSimulated) {
        el("chartNote").textContent =
          `Observed = blue • Simulated = red • Hover for daily values • ${UNIT_LABEL}`;
      } else if (hasObserved) {
        el("chartNote").textContent =
          `Observed streamflow available • Simulated data unavailable for this selection • ${UNIT_LABEL}`;
      } else if (hasSimulated) {
        el("chartNote").textContent =
          `Simulated streamflow available • Observed data unavailable for this selection • ${UNIT_LABEL}`;
      } else {
        el("chartNote").textContent =
          "No streamflow values found for this selection.";
      }

      try {
        const rainCache =
          await loadAnnualRainfallOnce(basinKey);

        if (rainCache) {
          const rainCol =
            resolveColumn(
              rainCache,
              stationName
            );

          if (rainCol) {
            const meanRain =
              avgRainInRange(
                rainCache,
                rainCol,
                startYear,
                endYear
              );

            el("climate").textContent =
              meanRain === null
                ? "—"
                : `${Math.round(meanRain)} mm/yr`;
          }
        }
      } catch (error) {
        console.error("Rainfall update failed:", error);
      }
    } catch (error) {
      console.error("Daily streamflow failed:", error);

      const c = initChartIfNeeded();

      if (c) {
        c.data.labels = [];
        c.data.datasets[0].data = [];
        c.data.datasets[1].data = [];
        c.update();
      }

      if (el("chartNote")) {
        el("chartNote").textContent =
          `Daily streamflow could not load: ${error.message}`;
      }
    }
  }

  // ============================================================
  // RETROSPECTIVE REFORECAST
  // ============================================================

  async function updateArchivedChartForStation(
    basinKey,
    stationName,
    refreshDropdowns = false
  ) {
    const ac = initArchivedChart();

    if (!ac) return;

    const selectionText = el("reforecastSelection");
    const note = el("reforecastNote");

    try {
      const rows =
        await loadReforecastRowsForStation(stationName);

      if (
        refreshDropdowns ||
        !el("archivedYear")?.options.length
      ) {
        fillReforecastYears(rows);
      }

      const selectedYear =
        Number(el("archivedYear")?.value);

      fillReforecastMonths(
        rows,
        selectedYear
      );

      const selectedMonth =
        Number(el("archivedMonth")?.value);

      const filtered = rows
        .filter(
          (row) =>
            Number(row.Year) === selectedYear &&
            Number(row.Month) === selectedMonth
        )
        .sort((a, b) => {
          const leadA = Number(a.Lead);
          const leadB = Number(b.Lead);

          if (
            Number.isFinite(leadA) &&
            Number.isFinite(leadB)
          ) {
            return leadA - leadB;
          }

          return Number(a.Day) - Number(b.Day);
        });

      const labels = [];
      const minValues = [];
      const maxValues = [];
      const meanValues = [];

      filtered.forEach((row) => {
        const members = [
          Number(row.Ens1),
          Number(row.Ens2),
          Number(row.Ens3),
          Number(row.Ens4),
          Number(row.Ens5)
        ].filter(Number.isFinite);

        if (!members.length) return;

        const minValue = Math.min(...members);
        const maxValue = Math.max(...members);

        const suppliedMean =
          Number(row["Ens-mean"]);

        const meanValue =
          Number.isFinite(suppliedMean)
            ? suppliedMean
            : members.reduce(
                (sum, value) => sum + value,
                0
              ) / members.length;

        labels.push(formatReforecastDate(row));

        minValues.push(minValue);
        maxValues.push(maxValue);
        meanValues.push(meanValue);
      });

      ac.data.labels = labels;
      ac.data.datasets[0].data = minValues;
      ac.data.datasets[1].data = maxValues;
      ac.data.datasets[2].data = meanValues;

      ac.update();

      const selectionLabel =
        `${stationName} • ${monthName(
          selectedMonth
        )} ${selectedYear} • 5-member ensemble`;

      if (selectionText) {
        selectionText.textContent =
          labels.length
            ? selectionLabel
            : `No retrospective reforecast data found for ${stationName}, ${monthName(
                selectedMonth
              )} ${selectedYear}.`;
      }

      if (note) {
        note.textContent =
          "Shaded area = min–max across Ens1–Ens5 • Solid line = Ens-mean";
      }
    } catch (error) {
      console.error(
        "Retrospective reforecast failed:",
        error
      );

      ac.data.labels = [];

      ac.data.datasets.forEach((dataset) => {
        dataset.data = [];
      });

      ac.update();

      if (selectionText) {
        selectionText.textContent =
          "Retrospective reforecast could not load. Check the XLSX filename and data folder.";
      }

      if (note) {
        note.textContent = error.message;
      }
    }
  }

  // ============================================================
  // LOAD BASIN
  // ============================================================

  async function loadBasin(basinKey) {
    const cfg = BASINS[basinKey];

    currentBasinKey = basinKey;

    setActiveTab(basinKey);

    if (el("basinLabel")) {
      el("basinLabel").textContent = cfg.label;
    }

    updateChartSources(basinKey);

    if (el("toggleDamsBtn")) {
      el("toggleDamsBtn").textContent =
        damsVisible
          ? "Hide dams"
          : "Show dams";
    }

    setStatus(`Loading ${cfg.label}...`);

    clearSidebarAndCharts();

    selectedMarker = null;

    removeLayer(boundaryLayer);
    removeLayer(riverLayer);
    removeLayer(stationsLayer);
    removeLayer(damLayer);

    try {
      const boundaryGeo =
        await fetchGeojson(cfg.boundary);

      boundaryLayer =
        L.geoJSON(boundaryGeo, {
          style: {
            color: "#0b3d91",
            weight: 4,
            opacity: 0.95,
            fillColor: "#2c7fb8",
            fillOpacity: 0.18
          }
        }).addTo(map);

      map.fitBounds(
        boundaryLayer.getBounds(),
        {
          padding: [20, 20]
        }
      );

      const riverGeo =
        await fetchGeojson(cfg.riverLine);

      riverLayer =
        L.geoJSON(riverGeo, {
          style: {
            color: "#1d4ed8",
            weight: 3,
            opacity: 0.9
          }
        }).addTo(map);
    } catch (error) {
      setStatus(
        `Error loading basin layers: ${error.message}`
      );

      return;
    }

    try {
      const stationsGeo =
        await fetchGeojson(cfg.stations);

      stationsLayer =
        L.geoJSON(stationsGeo, {
          pointToLayer: (feature, latlng) =>
            L.marker(latlng, {
              icon: L.divIcon({
                html:
                  '<div style="font-size:28px;">📍</div>',
                className: "",
                iconSize: [28, 28],
                iconAnchor: [14, 28]
              })
            }),

          onEachFeature: (feature, layer) => {
            const props =
              feature.properties || {};

            const stationName =
              props.Station ||
              props.Name ||
              props.station ||
              props.name ||
              "Station";

            layer.bindTooltip(
              `<div style="font-size:14px; font-weight:600;">${stationName}</div>`,
              {
                sticky: true,
                direction: "top",
                opacity: 0.95
              }
            );

            layer.on("mouseover", () => {
              if (layer === selectedMarker) return;

              layer.setIcon(
                L.divIcon({
                  html:
                    '<div style="font-size:34px;">📍</div>',
                  className: "",
                  iconSize: [34, 34],
                  iconAnchor: [17, 34]
                })
              );
            });

            layer.on("mouseout", () => {
              if (layer !== selectedMarker) {
                layer.setIcon(
                  L.divIcon({
                    html:
                      '<div style="font-size:28px;">📍</div>',
                    className: "",
                    iconSize: [28, 28],
                    iconAnchor: [14, 28]
                  })
                );
              }
            });

            layer.on("click", async () => {
              if (selectedMarker) {
                selectedMarker.setIcon(
                  L.divIcon({
                    html:
                      '<div style="font-size:28px;">📍</div>',
                    className: "",
                    iconSize: [28, 28],
                    iconAnchor: [14, 28]
                  })
                );
              }

              layer.setIcon(
                L.divIcon({
                  html:
                    '<div style="font-size:40px;">📍</div>',
                  className: "",
                  iconSize: [40, 40],
                  iconAnchor: [20, 40]
                })
              );

              selectedMarker = layer;
              currentStation = stationName;

              updatePanelForStation(
                basinKey,
                stationName
              );

              map.setView(
                layer.getLatLng(),
                7
              );

              await updateChartForStation(
                basinKey,
                stationName
              );

              await updateLandcoverForStation(
                basinKey,
                stationName
              );

              openFloatingPanel(
                basinKey,
                stationName
              );

              try {
                await updateArchivedChartForStation(
                  basinKey,
                  stationName,
                  true
                );
              } catch (error) {
                console.error(error);
              }
            });
          }
        }).addTo(map);
    } catch (error) {
      setStatus(
        `Stations failed to load: ${error.message}`
      );

      return;
    }

    try {
      await loadDamLayer(basinKey);
    } catch (error) {
      console.error(
        "Dam layer failed to load:",
        error
      );
    }

    loadObservedOnce(basinKey).catch(() => {});
    loadSimulatedOnce(basinKey).catch(() => {});

    if (cfg.rainfallCsv) {
      loadAnnualRainfallOnce(basinKey).catch(() => {});
    }

    if (cfg.landcoverCsv) {
      loadLandcoverOnce(basinKey).catch(() => {});
    }

    setStatus(
      `Loaded ${cfg.label}. Click a station or dam to view details.`
    );
  }

  // ============================================================
  // BOTTOM CHART DRAWER
  // ============================================================

  (function setupChartDrawer() {
    const chartEl = el("bottomChart");
    const handle = el("resizeHandle");
    const closeBtn = el("closeChartBtn");
    const showBtn = el("showChartBtn");

    if (!chartEl || !handle || !closeBtn || !showBtn) {
      return;
    }

    closeBtn.addEventListener("click", () => {
      chartEl.classList.add("closed");
      showBtn.classList.add("visible");
      map.invalidateSize();
    });

    showBtn.addEventListener("click", () => {
      chartEl.classList.remove("closed");
      showBtn.classList.remove("visible");

      map.invalidateSize();

      if (chart) {
        chart.resize();
      }
    });

    let dragging = false;
    let startY = 0;
    let startH = 0;

    const clamp = (value, min, max) =>
      Math.max(min, Math.min(max, value));

    handle.addEventListener("mousedown", (event) => {
      dragging = true;
      startY = event.clientY;

      startH =
        chartEl.getBoundingClientRect().height;

      document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (event) => {
      if (!dragging) return;

      const dy = startY - event.clientY;

      const maxH =
        Math.round(window.innerHeight * 0.6);

      const newH =
        clamp(
          startH + dy,
          180,
          maxH
        );

      chartEl.style.height = `${newH}px`;

      map.invalidateSize();

      if (chart) {
        chart.resize();
      }
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
      document.body.style.userSelect = "";
    });
  })();

  // ============================================================
  // FLOATING TABS
  // ============================================================

  el("tabForecast")?.addEventListener("click", () => {
    setActiveFloatingTab("forecast");
  });

  el("tabArchived")?.addEventListener(
    "click",
    async () => {
      setActiveFloatingTab("archived");

      if (currentStation) {
        await updateArchivedChartForStation(
          currentBasinKey,
          currentStation
        );
      }
    }
  );

  el("archivedYear")?.addEventListener(
    "change",
    async () => {
      if (!currentStation) return;

      const rows =
        await loadReforecastRowsForStation(
          currentStation
        );

      const selectedYear =
        Number(el("archivedYear")?.value);

      fillReforecastMonths(
        rows,
        selectedYear
      );

      await updateArchivedChartForStation(
        currentBasinKey,
        currentStation
      );
    }
  );

  el("archivedMonth")?.addEventListener(
    "change",
    async () => {
      if (!currentStation) return;

      await updateArchivedChartForStation(
        currentBasinKey,
        currentStation
      );
    }
  );

  // ============================================================
  // FLOATING PANEL BUTTONS
  // ============================================================

  el("closePanelBtn")?.addEventListener(
    "click",
    closeFloatingPanel
  );

  el("minimizePanelBtn")?.addEventListener(
    "click",
    toggleMinimizeFloatingPanel
  );

  // ============================================================
  // DAILY STREAMFLOW CONTROLS
  // ============================================================

  el("startYear")?.addEventListener(
    "change",
    async () => {
      if (!currentStation) return;

      const startYear =
        Number(el("startYear").value);

      const endYear =
        Number(el("endYear").value);

      if (
        Number.isFinite(startYear) &&
        Number.isFinite(endYear) &&
        startYear > endYear
      ) {
        el("endYear").value =
          String(startYear);
      }

      await updateChartForStation(
        currentBasinKey,
        currentStation
      );
    }
  );

  el("endYear")?.addEventListener(
    "change",
    async () => {
      if (!currentStation) return;

      const startYear =
        Number(el("startYear").value);

      const endYear =
        Number(el("endYear").value);

      if (
        Number.isFinite(startYear) &&
        Number.isFinite(endYear) &&
        endYear < startYear
      ) {
        el("startYear").value =
          String(endYear);
      }

      await updateChartForStation(
        currentBasinKey,
        currentStation
      );
    }
  );

  el("lineMode")?.addEventListener(
    "change",
    () => {
      applyLineMode();
    }
  );

  // ============================================================
  // BUTTONS
  // ============================================================

  el("toggleDamsBtn")?.addEventListener(
    "click",
    toggleDams
  );

  el("btnIrrawaddy")?.addEventListener(
    "click",
    () => loadBasin("irrawaddy")
  );

  el("btnMekong")?.addEventListener(
    "click",
    () => loadBasin("mekong")
  );

  // ============================================================
  // START
  // ============================================================

  await loadBasin("irrawaddy");
})();
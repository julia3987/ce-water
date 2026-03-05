// app.js (FINAL FULL FILE) — with basin switch, stations, daily chart, rainfall by year (Irrawaddy),
// and landcover donut showing TOP 3 + Other + text list in sidebar.

(async function () {
  const UNIT_LABEL = "m³/s";

  const DRY_MONTHS = new Set([11, 12, 1, 2, 3, 4]);
  const WET_MONTHS = new Set([5, 6, 7, 8, 9, 10]);

  const BASINS = {
    irrawaddy: {
      key: "irrawaddy",
      label: "Irrawaddy Basin",
      riverName: "Irrawaddy",
      boundary: "data/Irrawaddy_river_basin_boundary.geojson",
      riverLine: "data/Irrawaddy_river_line.geojson",
      stations: "data/Irrawaddy_flow_stations.geojson",
      csv: "data/Simulation_Irrawaddy.csv",
      csvLabel: "Simulated",
      rainfallCsv: "data/Annual_rainfall_Irrawaddy.csv",
      landcoverCsv: "data/Landcover_Irrawaddy.csv"
    },
    mekong: {
      key: "mekong",
      label: "Mekong Basin",
      riverName: "Mekong",
      boundary: "data/Mekong_river_basin_boundary.geojson",
      riverLine: "data/Mekong_river_line.geojson",
      stations: "data/Mekong_flow_stations.geojson",
      csv: "data/Observation_Mekong.csv",
      csvLabel: "Observed"
      // (No rainfall/landcover yet unless you add csv paths)
    }
  };

  const el = (id) => document.getElementById(id);

  function setStatus(msg) {
    const s = el("statusText");
    if (s) s.textContent = msg || "";
  }

  function setActiveTab(basinKey) {
    el("btnIrrawaddy")?.classList.toggle("active", basinKey === "irrawaddy");
    el("btnMekong")?.classList.toggle("active", basinKey === "mekong");
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

    if (cache.series?.[stationName] !== undefined) return stationName;

    const underscored = String(stationName).trim().replace(/\s+/g, "_");
    if (cache.series?.[underscored] !== undefined) return underscored;

    const norm = normalizeKey(stationName);
    return cache.colByNorm?.[norm] ?? null;
  }

  // -------------------------
  // MAP SETUP
  // -------------------------
  const map = L.map("map");
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors &copy; CARTO" }
  ).addTo(map);

  let boundaryLayer = null;
  let riverLayer = null;
  let stationsLayer = null;
  let selectedMarker = null;

  function removeLayer(layer) {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  }

  async function fetchGeojson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load: ${url}`);
    return await res.json();
  }

  // -------------------------
  // DAILY STREAMFLOW CHART
  // -------------------------
  const dailyCache = {};
  let chart = null;

  function initChartIfNeeded() {
    if (chart) return chart;

    const canvas = el("stationChart");
    if (!canvas) return null;

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: `Streamflow (${UNIT_LABEL})`,
          data: [],
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items?.[0]?.label || "",
              label: (ctx) => {
                const y = ctx.parsed.y;
                return `Value: ${Number.isFinite(y) ? y.toFixed(2) : "—"} ${UNIT_LABEL}`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 10 }, title: { display: true, text: "Date" } },
          y: { title: { display: true, text: `Streamflow (${UNIT_LABEL})` } }
        }
      }
    });

    return chart;
  }

  async function loadDailyDataOnce(basinKey) {
    if (dailyCache[basinKey]) return dailyCache[basinKey];

    const cfg = BASINS[basinKey];
    const res = await fetch(cfg.csv);
    if (!res.ok) throw new Error(`Could not load CSV: ${cfg.csv}`);

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",").map(s => s.trim());

    const dateIdx = header.indexOf("Date");
    if (dateIdx === -1) throw new Error(`CSV must have a "Date" column`);

    const cols = header.filter(h => h !== "Date");
    const dates = [];
    const series = {};
    cols.forEach(c => (series[c] = []));

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      dates.push(parts[dateIdx]);

      cols.forEach(c => {
        const colIdx = header.indexOf(c);
        const v = Number(parts[colIdx]);
        series[c].push(Number.isFinite(v) ? v : null);
      });
    }

    const years = Array.from(new Set(dates.map(d => Number(String(d).slice(0, 4)))))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    const colByNorm = {};
    cols.forEach(c => { colByNorm[normalizeKey(c)] = c; });

    dailyCache[basinKey] = { dates, years, series, colByNorm };
    return dailyCache[basinKey];
  }

  function fillYearDropdowns(years) {
    const startSel = el("startYear");
    const endSel = el("endYear");
    if (!startSel || !endSel) return;

    startSel.innerHTML = "";
    endSel.innerHTML = "";

    years.forEach(y => {
      const a = document.createElement("option");
      a.value = y;
      a.textContent = y;
      startSel.appendChild(a);

      const b = document.createElement("option");
      b.value = y;
      b.textContent = y;
      endSel.appendChild(b);
    });

    const last = years[years.length - 1];
    const secondLast = years.length >= 2 ? years[years.length - 2] : last;

    startSel.value = secondLast;
    endSel.value = last;
  }

  function getRangeIndices(dates, startYear, endYear) {
    const startStr = `${startYear}-01-01`;
    const endStr = `${endYear}-12-31`;

    let startIdx = 0;
    let endIdx = dates.length - 1;

    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= startStr) { startIdx = i; break; }
    }
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= endStr) { endIdx = i; break; }
    }
    return [startIdx, endIdx];
  }

  function avg(nums) {
    let sum = 0;
    let n = 0;
    for (const v of nums) {
      if (!Number.isFinite(v)) continue;
      sum += v;
      n += 1;
    }
    return n ? sum / n : null;
  }

  function monthFromDateStr(dateStr) {
    return Number(String(dateStr).slice(5, 7));
  }

  function formatStream(v) {
    return v === null ? "—" : `${v.toFixed(2)} ${UNIT_LABEL}`;
  }

  function updateSeasonBoxes(datesSlice, valuesSlice) {
    const dryVals = [];
    const wetVals = [];
    const allVals = [];

    for (let i = 0; i < datesSlice.length; i++) {
      const m = monthFromDateStr(datesSlice[i]);
      const v = valuesSlice[i];
      if (!Number.isFinite(v)) continue;

      allVals.push(v);
      if (DRY_MONTHS.has(m)) dryVals.push(v);
      if (WET_MONTHS.has(m)) wetVals.push(v);
    }

    el("dry").textContent = formatStream(avg(dryVals));
    el("wet").textContent = formatStream(avg(wetVals));
    el("annual").textContent = formatStream(avg(allVals));
  }

  // -------------------------
  // ANNUAL RAINFALL (IRRAWADDY)
  // -------------------------
  const rainfallCache = {};

  async function loadAnnualRainfallOnce(basinKey) {
    const cfg = BASINS[basinKey];
    if (!cfg?.rainfallCsv) return null;
    if (rainfallCache[basinKey]) return rainfallCache[basinKey];

    const res = await fetch(cfg.rainfallCsv);
    if (!res.ok) throw new Error(`Could not load rainfall CSV: ${cfg.rainfallCsv}`);

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",").map(s => s.trim());

    const yearIdx = header.indexOf("Year");
    if (yearIdx === -1) throw new Error(`Rainfall CSV must have a "Year" column`);

    const cols = header.filter(h => h !== "Year");
    const years = [];
    const series = {};
    cols.forEach(c => (series[c] = []));

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const y = Number(parts[yearIdx]);
      if (!Number.isFinite(y)) continue;

      years.push(y);

      cols.forEach(c => {
        const colIdx = header.indexOf(c);
        const v = Number(parts[colIdx]);
        series[c].push(Number.isFinite(v) ? v : null);
      });
    }

    const colByNorm = {};
    cols.forEach(c => { colByNorm[normalizeKey(c)] = c; });

    rainfallCache[basinKey] = { years, series, colByNorm };
    return rainfallCache[basinKey];
  }

  function avgRainInRange(rainCache, colName, startYear, endYear) {
    const vals = [];
    for (let i = 0; i < rainCache.years.length; i++) {
      const y = rainCache.years[i];
      if (y < startYear || y > endYear) continue;
      const v = rainCache.series[colName][i];
      if (Number.isFinite(v)) vals.push(v);
    }
    return avg(vals);
  }

  // -------------------------
  // LANDCOVER DONUT (TOP 3 + OTHER)
  // -------------------------
  const landcoverCache = {};
  let landcoverChart = null;

  function initLandcoverChart() {
    if (landcoverChart) return landcoverChart;

    const canvas = el("landcoverChart");
    if (!canvas) return null;

    landcoverChart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: [],
          borderColor: "#ffffff",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed.toFixed(1)}%` } }
        },
        cutout: "55%"
      }
    });

    return landcoverChart;
  }

  async function loadLandcoverOnce(basinKey) {
    const cfg = BASINS[basinKey];
    if (!cfg?.landcoverCsv) return null;
    if (landcoverCache[basinKey]) return landcoverCache[basinKey];

    const res = await fetch(cfg.landcoverCsv);
    if (!res.ok) throw new Error(`Could not load landcover CSV: ${cfg.landcoverCsv}`);

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",").map(s => s.trim());

    const idxSub = header.indexOf("Subbasin");
    const idxType = header.indexOf("Landcover");
    const idxPct = header.indexOf("Percentage");

    if (idxSub === -1 || idxType === -1 || idxPct === -1) {
      throw new Error(`Landcover CSV must have columns: Subbasin, Landcover, Percentage`);
    }

    const bySubbasin = {};

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const sub = parts[idxSub]?.trim();
      const lc = parts[idxType]?.trim();
      const pct = Number(parts[idxPct]);

      if (!sub || !lc || !Number.isFinite(pct)) continue;

      const key = normalizeKey(sub);
      if (!bySubbasin[key]) bySubbasin[key] = { labels: [], values: [] };

      bySubbasin[key].labels.push(lc);
      bySubbasin[key].values.push(pct);
    }

    landcoverCache[basinKey] = { bySubbasin };
    return landcoverCache[basinKey];
  }

  async function updateLandcoverForStation(basinKey, stationName) {
    const c = initLandcoverChart();
    const fallback = el("landcoverFallback");
    if (!c || !fallback) return;

    // Ensure a place for the Top 3 list
    let top3El = document.getElementById("landcoverTop3");
    if (!top3El) {
      top3El = document.createElement("div");
      top3El.id = "landcoverTop3";
      top3El.className = "smallNote";
      top3El.style.marginTop = "10px";
      const card = c.canvas.closest(".card");
      if (card) card.appendChild(top3El);
    }

    fallback.style.display = "none";
    fallback.textContent = "";
    top3El.innerHTML = "";

    // Clear chart
    c.data.labels = [];
    c.data.datasets[0].data = [];
    c.data.datasets[0].backgroundColor = [];
    c.update();

    try {
      const cache = await loadLandcoverOnce(basinKey);
      if (!cache) {
        fallback.style.display = "block";
        fallback.textContent = "Land cover not available for this basin yet.";
        return;
      }

      const key = normalizeKey(stationName);
      const entry = cache.bySubbasin[key];

      if (!entry) {
        fallback.style.display = "block";
        fallback.textContent = `No land cover data found for: ${stationName}`;
        return;
      }

      // Clean pairs
      const pairs = entry.labels.map((lab, i) => ({
        label: lab,
        value: Number(entry.values[i])
      })).filter(p => p.label && Number.isFinite(p.value) && p.value > 0);

      const total = pairs.reduce((a, p) => a + p.value, 0);
      if (!total) {
        fallback.style.display = "block";
        fallback.textContent = `Land cover values are all zero for: ${stationName}`;
        return;
      }

      // Normalize to 100
      pairs.forEach(p => { p.pct = (p.value / total) * 100; });

      // Sort descending
      pairs.sort((a, b) => b.pct - a.pct);

      const top3 = pairs.slice(0, 3);
      const otherPct = pairs.slice(3).reduce((a, p) => a + p.pct, 0);

      const finalLabels = [...top3.map(p => p.label)];
      const finalData = [...top3.map(p => p.pct)];

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

      const defaultPalette = ["#2E7D32", "#F9A825", "#8D6E63", "#1E88E5", "#7CB342", "#616161", "#90CAF9", "#BDBDBD"];
      const colors = finalLabels.map((lab, i) => colorByClass[lab] || defaultPalette[i % defaultPalette.length]);

      // Update donut
      c.data.labels = finalLabels;
      c.data.datasets[0].data = finalData;
      c.data.datasets[0].backgroundColor = colors;
      c.update();

      // Text Top 3 list
      top3El.innerHTML = `
        <div style="font-weight:600; margin-bottom:6px;">Top land cover</div>
        <div>1) ${top3[0] ? `${top3[0].label} — ${top3[0].pct.toFixed(1)}%` : "—"}</div>
        <div>2) ${top3[1] ? `${top3[1].label} — ${top3[1].pct.toFixed(1)}%` : "—"}</div>
        <div>3) ${top3[2] ? `${top3[2].label} — ${top3[2].pct.toFixed(1)}%` : "—"}</div>
      `;

    } catch (e) {
      fallback.style.display = "block";
      fallback.textContent = "Land cover file didn’t load (check your CSV path).";
      console.error(e);
    }
  }

  // -------------------------
  // SIDEBAR + TITLES
  // -------------------------
  let currentStation = null;
  let currentBasinKey = "irrawaddy";

  function clearSidebarAndCharts() {
    el("panelTitle").textContent = "Click a station";
    el("panelSubtitle").textContent = "Hover or click a station to see details.";
    el("river").textContent = "—";
    el("climate").textContent = "—";

    el("trendTitle").textContent = "Trend (—)";
    el("dry").textContent = "—";
    el("wet").textContent = "—";
    el("annual").textContent = "—";

    const c = initChartIfNeeded();
    if (c) {
      c.data.labels = [];
      c.data.datasets[0].data = [];
      c.update();
    }

    el("chartTitle").textContent = "Daily Streamflow";
    el("chartNote").textContent = "Click a station to load its chart.";

    const lc = initLandcoverChart();
    if (lc) {
      lc.data.labels = [];
      lc.data.datasets[0].data = [];
      lc.data.datasets[0].backgroundColor = [];
      lc.update();
    }

    el("landcoverFallback").style.display = "none";
    el("landcoverFallback").textContent = "";

    const top3El = document.getElementById("landcoverTop3");
    if (top3El) top3El.innerHTML = "";

    el("startYear").innerHTML = "";
    el("endYear").innerHTML = "";

    currentStation = null;
  }

  function updatePanelForStation(basinKey, stationName) {
    el("panelTitle").textContent = stationName;
    el("river").textContent = BASINS[basinKey].riverName;
    el("climate").textContent = "—";

    el("trendTitle").textContent = "Trend (—)";
    el("dry").textContent = "—";
    el("wet").textContent = "—";
    el("annual").textContent = "—";
  }

  function updateTimeFrameText(basinKey, stationName, startDate, endDate, startYear, endYear) {
    const cfg = BASINS[basinKey];
    el("panelSubtitle").textContent = `${stationName} • ${startDate} to ${endDate}`;
    el("chartTitle").textContent = `${cfg.csvLabel} Daily Streamflow (${startYear}-${endYear}) • ${UNIT_LABEL}`;
    el("trendTitle").textContent = `Trend (${startYear}-${endYear})`;
  }

  async function updateChartForStation(basinKey, stationName) {
    currentStation = stationName;

    const cache = await loadDailyDataOnce(basinKey);
    const c = initChartIfNeeded();
    if (!c) return;

    if (el("startYear").options.length === 0) fillYearDropdowns(cache.years);

    const startYear = Number(el("startYear").value || cache.years[0]);
    const endYear = Number(el("endYear").value || cache.years[cache.years.length - 1]);

    const colName = resolveColumn(cache, stationName);
    if (!colName) {
      c.data.labels = [];
      c.data.datasets[0].data = [];
      c.update();
      el("chartNote").textContent = `No CSV column found for "${stationName}".`;
      return;
    }

    const valuesAll = cache.series[colName];
    const [i0, i1] = getRangeIndices(cache.dates, startYear, endYear);

    const labels = cache.dates.slice(i0, i1 + 1);
    const values = valuesAll.slice(i0, i1 + 1);

    c.data.labels = labels;
    c.data.datasets[0].data = values;
    c.update();

    updateSeasonBoxes(labels, values);

    const startDate = labels[0] || "—";
    const endDate = labels[labels.length - 1] || "—";
    updateTimeFrameText(basinKey, stationName, startDate, endDate, startYear, endYear);

    el("chartNote").textContent = `Loaded: ${colName} • Hover for daily values • ${UNIT_LABEL}`;

    // Dynamic rainfall in sidebar (if present for basin)
    try {
      const rainCache = await loadAnnualRainfallOnce(basinKey);
      if (rainCache) {
        const rainCol = resolveColumn(rainCache, stationName);
        if (rainCol) {
          const meanRain = avgRainInRange(rainCache, rainCol, startYear, endYear);
          el("climate").textContent = meanRain === null ? "—" : `${meanRain.toFixed(0)} mm/yr`;
        }
      }
    } catch (_) {}

    el("startYear").onchange = () => {
      if (Number(el("startYear").value) > Number(el("endYear").value)) {
        el("endYear").value = el("startYear").value;
      }
      if (currentStation) updateChartForStation(currentBasinKey, currentStation);
    };

    el("endYear").onchange = () => {
      if (Number(el("endYear").value) < Number(el("startYear").value)) {
        el("startYear").value = el("endYear").value;
      }
      if (currentStation) updateChartForStation(currentBasinKey, currentStation);
    };
  }

  // -------------------------
  // LOAD BASIN
  // -------------------------
  async function loadBasin(basinKey) {
    const cfg = BASINS[basinKey];
    currentBasinKey = basinKey;

    setActiveTab(basinKey);
    el("basinLabel").textContent = cfg.label;

    setStatus(`Loading ${cfg.label}...`);
    clearSidebarAndCharts();

    selectedMarker = null;

    removeLayer(boundaryLayer);
    removeLayer(riverLayer);
    removeLayer(stationsLayer);

    try {
      const boundaryGeo = await fetchGeojson(cfg.boundary);
      boundaryLayer = L.geoJSON(boundaryGeo, {
        style: { color: "#0b3d91", weight: 4, opacity: 0.95, fillColor: "#2c7fb8", fillOpacity: 0.18 }
      }).addTo(map);

      map.fitBounds(boundaryLayer.getBounds(), { padding: [20, 20] });

      const riverGeo = await fetchGeojson(cfg.riverLine);
      riverLayer = L.geoJSON(riverGeo, { style: { color: "#1d4ed8", weight: 3, opacity: 0.9 } }).addTo(map);
    } catch (e) {
      setStatus(`Error loading basin layers: ${e.message}`);
      return;
    }

    try {
      const stationsGeo = await fetchGeojson(cfg.stations);

      stationsLayer = L.geoJSON(stationsGeo, {
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, { radius: 7, color: "#0b3d91", weight: 2, fillColor: "#fff", fillOpacity: 0.9 }),
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};
          const stationName = props.Station || props.Name || props.station || props.name || "Station";

          layer.bindTooltip(
            `<div style="font-size:14px; font-weight:600;">${stationName}</div>`,
            { sticky: true, direction: "top", opacity: 0.95 }
          );

          layer.on("mouseover", () => layer.setStyle({ radius: 9 }));
          layer.on("mouseout", () => { if (layer !== selectedMarker) layer.setStyle({ radius: 7 }); });

          layer.on("click", async () => {
            if (selectedMarker) selectedMarker.setStyle({ radius: 7, weight: 2 });
            layer.setStyle({ radius: 10, weight: 4 });
            selectedMarker = layer;

            updatePanelForStation(basinKey, stationName);
            map.setView(layer.getLatLng(), 7);

            await updateChartForStation(basinKey, stationName);
            await updateLandcoverForStation(basinKey, stationName);
          });
        }
      }).addTo(map);

    } catch (e) {
      setStatus(`Stations failed to load: ${e.message}`);
      return;
    }

    // Preload optional
    loadDailyDataOnce(basinKey).catch(() => {});
    if (cfg.rainfallCsv) loadAnnualRainfallOnce(basinKey).catch(() => {});
    if (cfg.landcoverCsv) loadLandcoverOnce(basinKey).catch(() => {});

    setStatus(`Loaded ${cfg.label}. Click a station to view charts and land cover.`);
  }

  // -------------------------
  // CHART DRAWER (resize + close/open)
  // -------------------------
  (function setupChartDrawer() {
    const chartEl = el("bottomChart");
    const handle = el("resizeHandle");
    const closeBtn = el("closeChartBtn");
    const showBtn = el("showChartBtn");

    if (!chartEl || !handle || !closeBtn || !showBtn) return;

    closeBtn.addEventListener("click", () => {
      chartEl.classList.add("closed");
      showBtn.classList.add("visible");
      map.invalidateSize();
    });

    showBtn.addEventListener("click", () => {
      chartEl.classList.remove("closed");
      showBtn.classList.remove("visible");
      map.invalidateSize();
      if (chart) chart.resize();
    });

    let dragging = false;
    let startY = 0;
    let startH = 0;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      startY = e.clientY;
      startH = chartEl.getBoundingClientRect().height;
      document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;

      const dy = startY - e.clientY;
      const maxH = Math.round(window.innerHeight * 0.55);
      const newH = clamp(startH + dy, 140, maxH);

      chartEl.style.height = `${newH}px`;
      map.invalidateSize();
      if (chart) chart.resize();
    });

    window.addEventListener("mouseup", () => {
      dragging = false;
      document.body.style.userSelect = "";
    });
  })();

  // Tabs
  el("btnIrrawaddy")?.addEventListener("click", () => loadBasin("irrawaddy"));
  el("btnMekong")?.addEventListener("click", () => loadBasin("mekong"));

  // Initial load
  await loadBasin("irrawaddy");
})();
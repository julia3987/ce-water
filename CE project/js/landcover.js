import { BASINS } from "./config.js";
import {
  el,
  normalizeKey
} from "./utils.js";

const landcoverCache = {};

let landcoverChart = null;

export function initLandcoverChart() {
  if (landcoverChart) {
    return landcoverChart;
  }

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

export async function loadLandcoverOnce(basinKey) {
  const cfg = BASINS[basinKey];

  if (!cfg?.landcoverCsv) {
    return null;
  }

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

  const lines = text
    .trim()
    .split(/\r?\n/);

  const header = lines[0]
    .split(",")
    .map((s) => s.trim());

  const bySubbasin = {};

  // Format 1:
  // Subbasin, Landcover, Percentage
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
      const landcover = parts[idxType]?.trim();
      const percentage = Number(parts[idxPct]);

      if (
        !sub ||
        !landcover ||
        !Number.isFinite(percentage)
      ) {
        continue;
      }

      const key = normalizeKey(sub);

      if (!bySubbasin[key]) {
        bySubbasin[key] = {
          labels: [],
          values: []
        };
      }

      bySubbasin[key].labels.push(landcover);
      bySubbasin[key].values.push(percentage);
    }
  }

  // Format 2:
  // Landcover, Station1, Station2, ...
  else if (header[0] === "Landcover") {
    const stationColumns = header.slice(1);

    stationColumns.forEach((station) => {
      const key = normalizeKey(station);

      bySubbasin[key] = {
        labels: [],
        values: []
      };
    });

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");

      const landcoverType =
        parts[0]?.trim();

      if (!landcoverType) {
        continue;
      }

      for (let j = 1; j < header.length; j++) {
        const station = header[j];

        const key =
          normalizeKey(station);

        const percentage =
          Number(parts[j]);

        if (!Number.isFinite(percentage)) {
          continue;
        }

        bySubbasin[key].labels.push(
          landcoverType
        );

        bySubbasin[key].values.push(
          percentage
        );
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

export async function updateLandcoverForStation(
  basinKey,
  stationName
) {
  const chart = initLandcoverChart();

  const fallback =
    el("landcoverFallback");

  if (!chart || !fallback) {
    return;
  }

  let top3El =
    document.getElementById("landcoverTop3");

  if (!top3El) {
    top3El =
      document.createElement("div");

    top3El.id = "landcoverTop3";
    top3El.className = "smallNote";
    top3El.style.marginTop = "10px";

    const card =
      chart.canvas.closest(".card");

    if (card) {
      card.appendChild(top3El);
    }
  }

  fallback.style.display = "none";
  fallback.textContent = "";

  top3El.innerHTML = "";

  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.data.datasets[0].backgroundColor = [];

  chart.update();

  try {
    const cache =
      await loadLandcoverOnce(basinKey);

    if (!cache) {
      fallback.style.display = "block";

      fallback.textContent =
        "Land cover not available for this basin yet.";

      return;
    }

    const key =
      normalizeKey(stationName);

    let entry =
      cache.bySubbasin[key];

    if (!entry) {
      const possibleMatch =
        Object.keys(
          cache.bySubbasin
        ).find(
          (candidate) =>
            candidate.includes(key) ||
            key.includes(candidate)
        );

      if (possibleMatch) {
        entry =
          cache.bySubbasin[
            possibleMatch
          ];
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
        value: Number(
          entry.values[index]
        )
      }))
      .filter(
        (pair) =>
          pair.label &&
          Number.isFinite(pair.value) &&
          pair.value > 0
      );

    const total =
      pairs.reduce(
        (sum, pair) =>
          sum + pair.value,
        0
      );

    if (!total) {
      fallback.style.display = "block";

      fallback.textContent =
        `Land cover values are all zero for: ${stationName}`;

      return;
    }

    pairs.forEach((pair) => {
      pair.pct =
        (pair.value / total) * 100;
    });

    pairs.sort(
      (a, b) =>
        b.pct - a.pct
    );

    const top3 =
      pairs.slice(0, 3);

    const otherPct =
      pairs
        .slice(3)
        .reduce(
          (sum, pair) =>
            sum + pair.pct,
          0
        );

    const finalLabels = [
      ...top3.map(
        (pair) => pair.label
      )
    ];

    const finalData = [
      ...top3.map(
        (pair) => pair.pct
      )
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

    const colors =
      finalLabels.map(
        (label, index) =>
          colorByClass[label] ||
          defaultPalette[
            index %
              defaultPalette.length
          ]
      );

    chart.data.labels =
      finalLabels;

    chart.data.datasets[0].data =
      finalData;

    chart.data.datasets[0].backgroundColor =
      colors;

    chart.update();

    top3El.innerHTML = `
      <div style="font-weight:600; margin-bottom:6px;">
        Top land cover
      </div>

      <div>
        1) ${
          top3[0]
            ? `${top3[0].label} — ${top3[0].pct.toFixed(1)}%`
            : "—"
        }
      </div>

      <div>
        2) ${
          top3[1]
            ? `${top3[1].label} — ${top3[1].pct.toFixed(1)}%`
            : "—"
        }
      </div>

      <div>
        3) ${
          top3[2]
            ? `${top3[2].label} — ${top3[2].pct.toFixed(1)}%`
            : "—"
        }
      </div>
    `;
  } catch (error) {
    fallback.style.display = "block";

    fallback.textContent =
      "Land cover file didn’t load (check your CSV path).";

    console.error(
      "Land cover failed:",
      error
    );
  }
}

export function clearLandcoverChart() {
  const chart =
    initLandcoverChart();

  if (chart) {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[0].backgroundColor = [];

    chart.update();
  }

  const fallback =
    el("landcoverFallback");

  if (fallback) {
    fallback.style.display = "none";
    fallback.textContent = "";
  }

  const top3El =
    document.getElementById(
      "landcoverTop3"
    );

  if (top3El) {
    top3El.innerHTML = "";
  }
}
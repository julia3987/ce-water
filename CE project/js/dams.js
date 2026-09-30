import { BASINS } from "./config.js";
import { el } from "./utils.js";

const damCache = {};

let damLayer = null;
let damsVisible = true;

export async function loadDamCsvOnce(basinKey) {
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

export function clearDamCard() {
  if (el("damName")) {
    el("damName").textContent = "—";
  }

  if (el("damRiverText")) {
    el("damRiverText").textContent =
      "River basin dam";
  }

  if (el("damYear")) {
    el("damYear").textContent = "—";
  }

  if (el("damCapacity")) {
    el("damCapacity").textContent = "—";
  }

  if (el("damVolume")) {
    el("damVolume").textContent = "—";
  }

  if (el("damCapacityMini")) {
    el("damCapacityMini").textContent = "—";
  }

  if (el("capacityFill")) {
    el("capacityFill").style.width = "0%";
  }
}

export function updateDamCard(
  dam,
  basinKey
) {
  if (el("stationSections")) {
    el("stationSections").style.display = "none";
  }

  if (el("damSection")) {
    el("damSection").style.display = "block";
  }

  if (el("stationNameText")) {
    el("stationNameText").textContent = "—";
  }

  const capacity =
    Number(dam["Capacity (MW)"]);

  const percent =
    Number.isFinite(capacity)
      ? Math.min(
          (capacity / 3000) * 100,
          100
        )
      : 0;

  if (el("panelTitle")) {
    el("panelTitle").textContent =
      `${dam["Dam"] || "Dam"} 🏗️`;
  }

  if (el("panelSubtitle")) {
    el("panelSubtitle").textContent =
      "Dam details";
  }

  if (el("damName")) {
    el("damName").textContent =
      dam["Dam"] || "—";
  }

  if (el("damRiverText")) {
    el("damRiverText").textContent =
      `${BASINS[basinKey].label} • hydropower dam`;
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
    el("capacityFill").style.width =
      `${percent}%`;
  }
}

function damIconSizeFromCapacity(capacity) {
  const value = Number(capacity);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 12;
  }

  if (value < 50) return 12;
  if (value < 200) return 14;
  if (value < 500) return 16;
  if (value < 1000) return 18;

  return 20;
}

function createDamIcon(capacity) {
  const size =
    damIconSizeFromCapacity(capacity);

  return L.icon({
    iconUrl: "damicon.png",

    iconSize: [
      size,
      size
    ],

    iconAnchor: [
      size / 2,
      size / 2
    ],

    popupAnchor: [
      0,
      -size / 2
    ]
  });
}

export function removeDamLayer(map) {
  if (
    damLayer &&
    map.hasLayer(damLayer)
  ) {
    map.removeLayer(damLayer);
  }
}

export async function loadDamLayer(
  map,
  basinKey
) {
  removeDamLayer(map);

  const rows =
    await loadDamCsvOnce(basinKey);

  damLayer = L.layerGroup();

  rows.forEach((dam) => {
    const lat =
      Number(dam["Latitude"]);

    const lon =
      Number(dam["Longitude"]);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      return;
    }

    const marker = L.marker(
      [lat, lon],
      {
        icon: createDamIcon(
          dam["Capacity (MW)"]
        )
      }
    );

    marker.bindTooltip(
      `<div style="font-size:13px; font-weight:600;">
        ${dam["Dam"] || "Dam"}
      </div>`,
      {
        sticky: true,
        direction: "top",
        opacity: 0.95
      }
    );

    marker.on("click", () => {
      updateDamCard(
        dam,
        basinKey
      );

      map.setView(
        [lat, lon],
        7
      );
    });

    marker.addTo(damLayer);
  });

  if (damsVisible) {
    damLayer.addTo(map);
  }

  return damLayer;
}

export function toggleDams(map) {
  if (!damLayer) return;

  damsVisible = !damsVisible;

  if (damsVisible) {
    damLayer.addTo(map);

    if (el("toggleDamsBtn")) {
      el("toggleDamsBtn").textContent =
        "Hide dams";
    }
  } else {
    removeDamLayer(map);

    if (el("toggleDamsBtn")) {
      el("toggleDamsBtn").textContent =
        "Show dams";
    }
  }
}

export function areDamsVisible() {
  return damsVisible;
}

export function getDamLayer() {
  return damLayer;
}
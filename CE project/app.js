import { BASINS } from "./js/config.js";
import { el, clamp } from "./js/utils.js";

import {
  initMap,
  getMap,
  loadBasin,
  resizeMap
} from "./js/map.js";

import {
  initStreamflowChart,
  loadObservedOnce,
  loadSimulatedOnce,
  updateChartForStation,
  clearStreamflowChart,
  setupStreamflowControls,
  resizeStreamflowChart
} from "./js/streamflow.js";

import {
  initLandcoverChart,
  updateLandcoverForStation,
  clearLandcoverChart,
  loadLandcoverOnce
} from "./js/landcover.js";

import {
  loadAnnualRainfallOnce
} from "./js/rainfall.js";

import {
  clearDamCard,
  toggleDams
} from "./js/dams.js";

import {
  openFloatingPanel,
  setActiveFloatingTab,
  setupForecastControls
} from "./js/forecast.js";

import {
  updateArchivedChartForStation,
  setupReforecastControls
} from "./js/reforecast.js";


// ============================================================
// APPLICATION STATE
// ============================================================

let currentStation = null;
let currentBasinKey = "irrawaddy";


// ============================================================
// SIDEBAR
// ============================================================

function showStationSidebar() {
  if (el("stationSections")) {
    el("stationSections").style.display = "block";
  }

  if (el("damSection")) {
    el("damSection").style.display = "none";
  }
}


function updatePanelForStation(
  basinKey,
  stationName
) {
  showStationSidebar();

  if (el("panelTitle")) {
    el("panelTitle").textContent =
      `${stationName} 📍`;
  }

  if (el("stationNameText")) {
    el("stationNameText").textContent =
      stationName;
  }

  if (el("river")) {
    el("river").textContent =
      BASINS[basinKey].riverName;
  }

  if (el("climate")) {
    el("climate").textContent = "—";
  }

  if (el("trendTitle")) {
    el("trendTitle").textContent =
      "Trend (—)";
  }

  if (el("dry")) {
    el("dry").textContent = "—";
  }

  if (el("wet")) {
    el("wet").textContent = "—";
  }

  if (el("annual")) {
    el("annual").textContent = "—";
  }
}


// ============================================================
// RESET DASHBOARD WHEN SWITCHING BASINS
// ============================================================

function clearSidebarAndCharts() {
  showStationSidebar();

  if (el("panelTitle")) {
    el("panelTitle").textContent =
      "Click a station 📍";
  }

  if (el("panelSubtitle")) {
    el("panelSubtitle").textContent =
      "Hover or click a station to see details.";
  }

  if (el("stationNameText")) {
    el("stationNameText").textContent = "—";
  }

  if (el("river")) {
    el("river").textContent = "—";
  }

  if (el("climate")) {
    el("climate").textContent = "—";
  }

  if (el("trendTitle")) {
    el("trendTitle").textContent =
      "Trend (—)";
  }

  if (el("dry")) {
    el("dry").textContent = "—";
  }

  if (el("wet")) {
    el("wet").textContent = "—";
  }

  if (el("annual")) {
    el("annual").textContent = "—";
  }

  clearDamCard();
  clearStreamflowChart();
  clearLandcoverChart();

  currentStation = null;
}


// ============================================================
// STATION CLICK
// ============================================================

async function handleStationClick(
  basinKey,
  stationName
) {
  currentStation = stationName;
  currentBasinKey = basinKey;

  updatePanelForStation(
    basinKey,
    stationName
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
      stationName,
      true
    );
  } catch (error) {
    console.error(
      "Reforecast update failed:",
      error
    );
  }
}


// ============================================================
// BASIN LOADING
// ============================================================

async function switchBasin(basinKey) {
  currentBasinKey = basinKey;
  currentStation = null;

  await loadBasin(
    basinKey,
    {
      onBeforeLoad: () => {
        clearSidebarAndCharts();
      },

      onStationClick:
        async (
          clickedBasinKey,
          stationName
        ) => {
          await handleStationClick(
            clickedBasinKey,
            stationName
          );
        },

      onBasinLoaded:
        async (
          loadedBasinKey
        ) => {
          // Preload data so station clicks feel faster.
          loadObservedOnce(
            loadedBasinKey
          ).catch(
            (error) =>
              console.error(
                "Observed preload failed:",
                error
              )
          );

          loadSimulatedOnce(
            loadedBasinKey
          ).catch(
            (error) =>
              console.error(
                "Simulated preload failed:",
                error
              )
          );

          if (
            BASINS[loadedBasinKey]
              .rainfallCsv
          ) {
            loadAnnualRainfallOnce(
              loadedBasinKey
            ).catch(
              (error) =>
                console.error(
                  "Rainfall preload failed:",
                  error
                )
            );
          }

          if (
            BASINS[loadedBasinKey]
              .landcoverCsv
          ) {
            loadLandcoverOnce(
              loadedBasinKey
            ).catch(
              (error) =>
                console.error(
                  "Land cover preload failed:",
                  error
                )
            );
          }
        }
    }
  );
}


// ============================================================
// BOTTOM STREAMFLOW CHART DRAWER
// ============================================================

function setupChartDrawer() {
  const chartElement =
    el("bottomChart");

  const resizeHandle =
    el("resizeHandle");

  const closeButton =
    el("closeChartBtn");

  const showButton =
    el("showChartBtn");

  if (
    !chartElement ||
    !resizeHandle ||
    !closeButton ||
    !showButton
  ) {
    return;
  }


  // Close chart drawer
  closeButton.addEventListener(
    "click",
    () => {
      chartElement.classList.add(
        "closed"
      );

      showButton.classList.add(
        "visible"
      );

      resizeMap();
    }
  );


  // Reopen chart drawer
  showButton.addEventListener(
    "click",
    () => {
      chartElement.classList.remove(
        "closed"
      );

      showButton.classList.remove(
        "visible"
      );

      resizeMap();
      resizeStreamflowChart();
    }
  );


  // Resize chart drawer
  let dragging = false;
  let startY = 0;
  let startHeight = 0;


  resizeHandle.addEventListener(
    "mousedown",
    (event) => {
      dragging = true;

      startY =
        event.clientY;

      startHeight =
        chartElement
          .getBoundingClientRect()
          .height;

      document.body.style.userSelect =
        "none";
    }
  );


  window.addEventListener(
    "mousemove",
    (event) => {
      if (!dragging) {
        return;
      }

      const difference =
        startY -
        event.clientY;

      const maxHeight =
        Math.round(
          window.innerHeight *
            0.6
        );

      const newHeight =
        clamp(
          startHeight +
            difference,
          180,
          maxHeight
        );

      chartElement.style.height =
        `${newHeight}px`;

      resizeMap();
      resizeStreamflowChart();
    }
  );


  window.addEventListener(
    "mouseup",
    () => {
      dragging = false;

      document.body.style.userSelect =
        "";
    }
  );
}


// ============================================================
// FLOATING PANEL TAB
// ============================================================

function setupArchivedTab() {
  el("tabArchived")
    ?.addEventListener(
      "click",
      async () => {
        setActiveFloatingTab(
          "archived"
        );

        if (!currentStation) {
          return;
        }

        await updateArchivedChartForStation(
          currentStation
        );
      }
    );
}


// ============================================================
// BASIN BUTTONS
// ============================================================

function setupBasinButtons() {
  el("btnIrrawaddy")
    ?.addEventListener(
      "click",
      async () => {
        await switchBasin(
          "irrawaddy"
        );
      }
    );


  el("btnMekong")
    ?.addEventListener(
      "click",
      async () => {
        await switchBasin(
          "mekong"
        );
      }
    );
}


// ============================================================
// DAM BUTTON
// ============================================================

function setupDamButton() {
  el("toggleDamsBtn")
    ?.addEventListener(
      "click",
      () => {
        const map =
          getMap();

        if (!map) {
          return;
        }

        toggleDams(map);
      }
    );
}


// ============================================================
// CURRENT STATE HELPERS
// ============================================================

function getCurrentStation() {
  return currentStation;
}


function getCurrentBasinKey() {
  return currentBasinKey;
}


// ============================================================
// START APPLICATION
// ============================================================

async function initApp() {
  // Create charts before interaction.
  initStreamflowChart();
  initLandcoverChart();

  // Create Leaflet map.
  initMap();

  // Set up controls.
  setupChartDrawer();

  setupForecastControls();

  setupArchivedTab();

  setupReforecastControls(
    getCurrentStation
  );

  setupStreamflowControls(
    getCurrentStation,
    getCurrentBasinKey
  );

  setupBasinButtons();
  setupDamButton();

  // Start with Irrawaddy.
  await switchBasin(
    "irrawaddy"
  );
}


initApp().catch(
  (error) => {
    console.error(
      "Application failed to start:",
      error
    );
  }
);
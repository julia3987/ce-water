import {
  UNIT_LABEL,
  BASINS
} from "./config.js";

import {
  el
} from "./utils.js";


let forecastChart = null;


// ============================================================
// FORECAST CHART
// ============================================================

export function initForecastChart() {
  if (forecastChart) {
    return forecastChart;
  }

  const canvas =
    el("forecastChart");

  if (!canvas) {
    return null;
  }


  forecastChart =
    new Chart(
      canvas,
      {
        type: "line",

        data: {
          labels: [],

          datasets: [
            {
              label:
                "Forecast",

              data: [],

              borderColor:
                "#0b3d91",

              backgroundColor:
                "#0b3d91",

              borderDash:
                [8, 6],

              tension:
                0.28,

              pointRadius:
                3,

              pointHoverRadius:
                5,

              borderWidth:
                3,

              fill:
                false
            }
          ]
        },


        options: {
          responsive:
            true,

          maintainAspectRatio:
            false,


          plugins: {
            legend: {
              display:
                true
            },


            tooltip: {
              callbacks: {
                label:
                  (ctx) => {
                    const y =
                      ctx.parsed.y;

                    return (
                      `Forecast: ${Math.round(
                        y
                      )} ${UNIT_LABEL}`
                    );
                  }
              }
            }
          },


          scales: {
            x: {
              title: {
                display:
                  true,

                text:
                  "Forecast day"
              }
            },


            y: {
              title: {
                display:
                  true,

                text:
                  `Streamflow (${UNIT_LABEL})`
              }
            }
          }
        }
      }
    );


  return forecastChart;
}


// ============================================================
// 7-DAY FORECAST PLACEHOLDER
// ============================================================

export function generatePlaceholderForecast(stationName) {
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


// ============================================================
// FLOATING PANEL TABS
// ============================================================

export function setActiveFloatingTab(
  tabName
) {
  const isForecast =
    tabName ===
    "forecast";


  if (el("forecastView")) {
    el("forecastView")
      .style.display =
      isForecast
        ? "block"
        : "none";
  }


  if (el("archivedView")) {
    el("archivedView")
      .style.display =
      isForecast
        ? "none"
        : "block";
  }


  el("tabForecast")
    ?.classList.toggle(
      "active",
      isForecast
    );


  el("tabArchived")
    ?.classList.toggle(
      "active",
      !isForecast
    );
}


// ============================================================
// OPEN FLOATING PANEL
// ============================================================

export function openFloatingPanel(
  basinKey,
  stationName
) {
  const panel =
    el("floatingPanel");


  const chart =
    initForecastChart();


  if (
    !panel ||
    !chart
  ) {
    return;
  }


  const preview =
    generatePlaceholderForecast(
      stationName
    );


  if (el("floatingTitle")) {
    el("floatingTitle")
      .textContent =
      stationName;
  }


  if (el("floatingSubtitle")) {
    el("floatingSubtitle")
      .textContent =
      `${BASINS[basinKey].label} • forecast and reforecast`;
  }


  chart.data.labels =
    preview.labels;


  chart.data.datasets[0].data =
    preview.values;


  chart.update();


  panel.classList.remove(
    "hidden"
  );


  panel.classList.remove(
    "minimized"
  );


  setActiveFloatingTab(
    "forecast"
  );
}


// ============================================================
// CLOSE FLOATING PANEL
// ============================================================

export function closeFloatingPanel() {
  el("floatingPanel")
    ?.classList.add(
      "hidden"
    );
}


// ============================================================
// MINIMIZE FLOATING PANEL
// ============================================================

export function toggleMinimizeFloatingPanel() {
  el("floatingPanel")
    ?.classList.toggle(
      "minimized"
    );
}


// ============================================================
// FORECAST CONTROLS
// ============================================================

export function setupForecastControls() {

  el("tabForecast")
    ?.addEventListener(
      "click",
      () => {
        setActiveFloatingTab(
          "forecast"
        );
      }
    );


  el("closePanelBtn")
    ?.addEventListener(
      "click",
      closeFloatingPanel
    );


  el("minimizePanelBtn")
    ?.addEventListener(
      "click",
      toggleMinimizeFloatingPanel
    );
}
import { BASINS } from "./config.js";
import { el } from "./utils.js";

import {
  loadDamLayer,
  removeDamLayer,
  areDamsVisible
} from "./dams.js";


// ============================================================
// MAP STATE
// ============================================================

let map = null;

let boundaryLayer = null;
let riverLayer = null;
let stationsLayer = null;

let selectedMarker = null;


// ============================================================
// INITIALIZE MAP
// ============================================================

export function initMap() {
  if (map) {
    return map;
  }

  map = L.map("map");

  // ==========================================================
  // ESRI WORLD STREET MAP
  // English-oriented basemap
  // No API key added to the website
  // ==========================================================

  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,

      attribution:
        "Tiles &copy; Esri"
    }
  ).addTo(map);

  return map;
}


// ============================================================
// GET MAP
// ============================================================

export function getMap() {
  return map;
}


// ============================================================
// STATUS TEXT
// ============================================================

function setStatus(message) {
  const status =
    el("statusText");

  if (status) {
    status.textContent =
      message || "";
  }
}


// ============================================================
// ACTIVE BASIN BUTTON
// ============================================================

function setActiveTab(basinKey) {
  el("btnIrrawaddy")
    ?.classList.toggle(
      "active",
      basinKey ===
        "irrawaddy"
    );

  el("btnMekong")
    ?.classList.toggle(
      "active",
      basinKey ===
        "mekong"
    );
}


// ============================================================
// REMOVE MAP LAYER
// ============================================================

function removeLayer(layer) {
  if (
    layer &&
    map &&
    map.hasLayer(layer)
  ) {
    map.removeLayer(layer);
  }
}


// ============================================================
// FETCH GEOJSON
// ============================================================

async function fetchGeojson(url) {
  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Could not load: ${url}`
    );
  }

  return await response.json();
}


// ============================================================
// STATION ICONS
// ============================================================

function createStationIcon(size) {
  return L.divIcon({
    html:
      `<div style="font-size:${size}px;">📍</div>`,

    className: "",

    iconSize: [
      size,
      size
    ],

    iconAnchor: [
      size / 2,
      size
    ]
  });
}


// ============================================================
// RESET SELECTED STATION
// ============================================================

export function resetSelectedMarker() {
  if (selectedMarker) {
    selectedMarker.setIcon(
      createStationIcon(28)
    );
  }

  selectedMarker = null;
}


// ============================================================
// UPDATE CHART SOURCE TEXT
// ============================================================

function updateChartSources(
  basinKey
) {
  const observedText =
    basinKey ===
    "irrawaddy"

      ? "Observed streamflow (Irrawaddy): GRDC (Global Runoff Data Center)"

      : "Observed streamflow (Mekong): MRC (Mekong River Commission)";


  if (el("sourcesObserved")) {
    el("sourcesObserved")
      .textContent =
      observedText;
  }


  if (el("sourcesPrecip")) {
    el("sourcesPrecip")
      .textContent =
      "Precipitation: GPM IMERG (half-hourly and daily)";
  }


  if (el("sourcesDam")) {
    el("sourcesDam")
      .textContent =
      "Dam: MSEA-Res";
  }


  if (el("sourcesLandcover")) {
    el("sourcesLandcover")
      .textContent =
      "Land cover: SERVIR-SEA";
  }
}


// ============================================================
// LOAD BASIN
// ============================================================

export async function loadBasin(
  basinKey,
  callbacks = {}
) {
  if (!map) {
    initMap();
  }

  const config =
    BASINS[basinKey];

  if (!config) {
    throw new Error(
      `Unknown basin: ${basinKey}`
    );
  }


  const {
    onBeforeLoad,
    onStationClick,
    onBasinLoaded
  } = callbacks;


  setActiveTab(
    basinKey
  );


  if (el("basinLabel")) {
    el("basinLabel")
      .textContent =
      config.label;
  }


  updateChartSources(
    basinKey
  );


  if (el("toggleDamsBtn")) {
    el("toggleDamsBtn")
      .textContent =
      areDamsVisible()
        ? "Hide dams"
        : "Show dams";
  }


  setStatus(
    `Loading ${config.label}...`
  );


  if (
    typeof onBeforeLoad ===
    "function"
  ) {
    onBeforeLoad(
      basinKey
    );
  }


  resetSelectedMarker();


  removeLayer(
    boundaryLayer
  );

  removeLayer(
    riverLayer
  );

  removeLayer(
    stationsLayer
  );

  removeDamLayer(
    map
  );


  // ==========================================================
  // BASIN BOUNDARY + RIVER
  // ==========================================================

  try {
    const boundaryGeo =
      await fetchGeojson(
        config.boundary
      );


    boundaryLayer =
      L.geoJSON(
        boundaryGeo,
        {
          style: {
            color: "#0b3d91",
            weight: 4,
            opacity: 0.95,
            fillColor: "#2c7fb8",
            fillOpacity: 0.18
          }
        }
      ).addTo(map);


    map.fitBounds(
      boundaryLayer
        .getBounds(),
      {
        padding: [
          20,
          20
        ]
      }
    );


    const riverGeo =
      await fetchGeojson(
        config.riverLine
      );


    riverLayer =
      L.geoJSON(
        riverGeo,
        {
          style: {
            color: "#1d4ed8",
            weight: 3,
            opacity: 0.9
          }
        }
      ).addTo(map);
  }

  catch (error) {
    console.error(
      "Basin layers failed:",
      error
    );

    setStatus(
      `Error loading basin layers: ${error.message}`
    );

    return;
  }


  // ==========================================================
  // STATIONS
  // ==========================================================

  try {
    const stationsGeo =
      await fetchGeojson(
        config.stations
      );


    stationsLayer =
      L.geoJSON(
        stationsGeo,
        {
          pointToLayer:
            (
              feature,
              latlng
            ) => {
              return L.marker(
                latlng,
                {
                  icon:
                    createStationIcon(
                      28
                    )
                }
              );
            },


          onEachFeature:
            (
              feature,
              layer
            ) => {
              const properties =
                feature.properties ||
                {};


              const stationName =
                properties.Station ||
                properties.Name ||
                properties.station ||
                properties.name ||
                "Station";


              // -----------------------------------------------
              // TOOLTIP
              // -----------------------------------------------

              layer.bindTooltip(
                `
                  <div style="font-size:14px; font-weight:600;">
                    ${stationName}
                  </div>
                `,
                {
                  sticky: true,
                  direction: "top",
                  opacity: 0.95
                }
              );


              // -----------------------------------------------
              // HOVER
              // -----------------------------------------------

              layer.on(
                "mouseover",
                () => {
                  if (
                    layer ===
                    selectedMarker
                  ) {
                    return;
                  }

                  layer.setIcon(
                    createStationIcon(
                      34
                    )
                  );
                }
              );


              layer.on(
                "mouseout",
                () => {
                  if (
                    layer !==
                    selectedMarker
                  ) {
                    layer.setIcon(
                      createStationIcon(
                        28
                      )
                    );
                  }
                }
              );


              // -----------------------------------------------
              // CLICK
              // -----------------------------------------------

              layer.on(
                "click",
                async () => {
                  if (
                    selectedMarker
                  ) {
                    selectedMarker
                      .setIcon(
                        createStationIcon(
                          28
                        )
                      );
                  }


                  layer.setIcon(
                    createStationIcon(
                      40
                    )
                  );


                  selectedMarker =
                    layer;


                  map.setView(
                    layer.getLatLng(),
                    7
                  );


                  if (
                    typeof onStationClick ===
                    "function"
                  ) {
                    try {
                      await onStationClick(
                        basinKey,
                        stationName,
                        layer
                      );
                    }

                    catch (error) {
                      console.error(
                        "Station click failed:",
                        error
                      );
                    }
                  }
                }
              );
            }
        }
      ).addTo(map);
  }

  catch (error) {
    console.error(
      "Stations failed to load:",
      error
    );

    setStatus(
      `Stations failed to load: ${error.message}`
    );

    return;
  }


  // ==========================================================
  // DAMS
  // ==========================================================

  try {
    await loadDamLayer(
      map,
      basinKey
    );
  }

  catch (error) {
    console.error(
      "Dam layer failed to load:",
      error
    );
  }


  // ==========================================================
  // FINISHED
  // ==========================================================

  setStatus(
    `Loaded ${config.label}. Click a station or dam to view details.`
  );


  if (
    typeof onBasinLoaded ===
    "function"
  ) {
    try {
      await onBasinLoaded(
        basinKey
      );
    }

    catch (error) {
      console.error(
        "Basin loaded callback failed:",
        error
      );
    }
  }
}


// ============================================================
// MAP RESIZE
// ============================================================

export function resizeMap() {
  if (map) {
    map.invalidateSize();
  }
}
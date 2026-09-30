export const UNIT_LABEL = "m³/s";

export const DRY_MONTHS = new Set([
  11, 12, 1, 2, 3, 4
]);

export const WET_MONTHS = new Set([
  5, 6, 7, 8, 9, 10
]);


// ============================================================
// REFORECAST DATA
// ============================================================

export const REFORECAST_XLSX =
  "data/Irrawaddy_Reforecast.xlsx";


// ============================================================
// BASIN CONFIGURATION
// ============================================================

export const BASINS = {

  irrawaddy: {
    key: "irrawaddy",

    label:
      "Irrawaddy Basin",

    riverName:
      "Irrawaddy",

    boundary:
      "data/Irrawaddy_river_basin_boundary.geojson",

    riverLine:
      "data/Irrawaddy_river_line.geojson",

    stations:
      "data/Irrawaddy_flow_stations.geojson",

    observedCsv:
      "data/Observation_Irrawaddy.csv",

    simulatedCsv:
      "data/Simulation_Irrawaddy.csv",

    rainfallCsv:
      "data/Annual_rainfall_Irrawaddy.csv",

    landcoverCsv:
      "data/Landcover_Irrawaddy.csv",

    damsCsv:
      "data/Irrawaddy_dams.csv"
  },


  mekong: {
    key: "mekong",

    label:
      "Mekong Basin",

    riverName:
      "Mekong",

    boundary:
      "data/Mekong_river_basin_boundary.geojson",

    riverLine:
      "data/Mekong_river_line.geojson",

    stations:
      "data/Mekong_flow_stations.geojson",

    observedCsv:
      "data/Observation_Mekong.csv",

    simulatedCsv:
      "data/Simulation_Mekong.csv",

    rainfallCsv:
      "data/Annual_rainfall_Mekong.csv",

    landcoverCsv:
      "data/Landcover_Mekong_all_types.csv",

    damsCsv:
      "data/Mekong_mainstream_dams.csv"
  }
};
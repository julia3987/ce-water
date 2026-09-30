import { BASINS } from "./config.js";
import {
  avg,
  normalizeKey,
  resolveColumn
} from "./utils.js";

const rainfallCache = {};

export async function loadAnnualRainfallOnce(basinKey) {
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

  cols.forEach((column) => {
    series[column] = [];
  });

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");

    const year = Number(parts[yearIdx]);

    if (!Number.isFinite(year)) continue;

    years.push(year);

    cols.forEach((column) => {
      const colIdx = header.indexOf(column);
      const value = Number(parts[colIdx]);

      series[column].push(
        Number.isFinite(value)
          ? value
          : null
      );
    });
  }

  const colByNorm = {};

  cols.forEach((column) => {
    colByNorm[normalizeKey(column)] = column;
  });

  rainfallCache[basinKey] = {
    years,
    series,
    colByNorm
  };

  return rainfallCache[basinKey];
}

export function avgRainInRange(
  rainCache,
  colName,
  startYear,
  endYear
) {
  const values = [];

  for (let i = 0; i < rainCache.years.length; i++) {
    const year = rainCache.years[i];

    if (year < startYear || year > endYear) {
      continue;
    }

    const value = rainCache.series[colName][i];

    if (Number.isFinite(value)) {
      values.push(value);
    }
  }

  return avg(values);
}

export async function getStationRainfall(
  basinKey,
  stationName,
  startYear,
  endYear
) {
  const cache =
    await loadAnnualRainfallOnce(basinKey);

  if (!cache) return null;

  const rainColumn =
    resolveColumn(cache, stationName);

  if (!rainColumn) return null;

  return avgRainInRange(
    cache,
    rainColumn,
    startYear,
    endYear
  );
}
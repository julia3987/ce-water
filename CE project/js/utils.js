export const el = (id) => document.getElementById(id);

export function normalizeKey(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "");
}

export function normalizeDate(dateString) {
  const raw = String(dateString ?? "").trim();

  if (!raw) return "";

  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const [year, month, day] = raw.split("-");

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // M/D/YYYY or MM/DD/YYYY
  // Used by the Mekong simulated streamflow file
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    const [month, day, year] = raw.split("/");

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return raw;
}

export function avg(numbers) {
  let sum = 0;
  let count = 0;

  for (const value of numbers) {
    if (!Number.isFinite(value)) continue;

    sum += value;
    count++;
  }

  return count ? sum / count : null;
}

export function monthFromDateStr(dateStr) {
  return Number(String(dateStr).slice(5, 7));
}

export function resolveColumn(cache, stationName) {
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

  const normalized = normalizeKey(stationName);

  return cache.colByNorm?.[normalized] ?? null;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
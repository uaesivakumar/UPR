/**
 * GEO helpers for UAE:
 *  - isUAE(locationLike)
 *  - emirateFromLocation(locationLike)
 *  - tagEmirate(record)  // mutates and returns record
 *  - enrichWithGeo(records[]) // NEW
 */

const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Fujairah",
  "Ras Al Khaimah",
  "Umm Al Quwain",
];

const CITY_TO_EMIRATE = new Map([
  ["abu dhabi", "Abu Dhabi"],
  ["al ain", "Abu Dhabi"],
  ["mussafah", "Abu Dhabi"],
  ["dubai", "Dubai"],
  ["jlt", "Dubai"],
  ["jumeirah", "Dubai"],
  ["business bay", "Dubai"],
  ["internet city", "Dubai"],
  ["sharjah", "Sharjah"],
  ["ajman", "Ajman"],
  ["fujairah", "Fujairah"],
  ["rak", "Ras Al Khaimah"],
  ["ras al khaimah", "Ras Al Khaimah"],
  ["umm al quwain", "Umm Al Quwain"],
  ["uaq", "Umm Al Quwain"],
]);

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function isUAE(loc) {
  const s = norm(
    typeof loc === "string"
      ? loc
      : [loc?.city, loc?.state, loc?.country, loc?.location].filter(Boolean).join(", ")
  );
  if (!s) return false;
  if (/(united arab emirates|u\.?a\.?e\.?|\buae\b)/i.test(s)) return true;
  for (const e of EMIRATES) if (s.includes(e.toLowerCase())) return true;
  for (const k of CITY_TO_EMIRATE.keys()) if (s.includes(k)) return true;
  return false;
}

export function emirateFromLocation(loc) {
  const s = norm(
    typeof loc === "string"
      ? loc
      : [loc?.city, loc?.state, loc?.country, loc?.location].filter(Boolean).join(", ")
  );
  if (!s) return "";
  for (const e of EMIRATES) if (s.includes(e.toLowerCase())) return e;
  for (const [k, v] of CITY_TO_EMIRATE.entries()) if (s.includes(k)) return v;
  if (/(united arab emirates|u\.?a\.?e\.?|\buae\b)/i.test(s)) return "United Arab Emirates";
  return "";
}

export function tagEmirate(record) {
  if (!record || typeof record !== "object") return record;
  const loc = record.location || [record.city, record.region, record.state, record.country]
    .filter(Boolean)
    .join(", ");
  const e = emirateFromLocation(loc);
  if (e) record.emirate = e;
  return record;
}

/**
 * Apply emirate tagging to all candidates
 */
export async function enrichWithGeo(records = []) {
  if (!Array.isArray(records)) return [];
  return records.map((r) => tagEmirate({ ...r }));
}

export default {
  isUAE,
  emirateFromLocation,
  tagEmirate,
  enrichWithGeo,
};

/**
 * GEO helpers focused on UAE heuristics
 * Exports:
 *   - isUAE(locationLike)
 *   - emirateFromLocation(locationLike)
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

// common city/area mentions mapped to emirates
const CITY_TO_EMIRATE = new Map([
  // Abu Dhabi
  ["abu dhabi","Abu Dhabi"],
  ["al ain","Abu Dhabi"],
  ["mussafah","Abu Dhabi"],
  // Dubai
  ["dubai","Dubai"],
  ["jlt","Dubai"],
  ["jumeirah","Dubai"],
  ["business bay","Dubai"],
  ["internet city","Dubai"],
  // Sharjah
  ["sharjah","Sharjah"],
  // Ajman
  ["ajman","Ajman"],
  // Fujairah
  ["fujairah","Fujairah"],
  // Ras Al Khaimah
  ["rak","Ras Al Khaimah"],
  ["ras al khaimah","Ras Al Khaimah"],
  // Umm Al Quwain
  ["umm al quwain","Umm Al Khaimah"], // minor typos handled below
  ["uaq","Umm Al Quwain"],
]);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns true if text clearly indicates United Arab Emirates */
export function isUAE(loc) {
  const s = norm(
    typeof loc === "string"
      ? loc
      : [loc?.city, loc?.state, loc?.country, loc?.location].filter(Boolean).join(", ")
  );
  if (!s) return false;
  if (/(united arab emirates|u\.?a\.?e\.?|\buae\b)/i.test(s)) return true;
  for (const e of EMIRATES) {
    if (s.includes(e.toLowerCase())) return true;
  }
  for (const k of CITY_TO_EMIRATE.keys()) {
    if (s.includes(k)) return true;
  }
  return false;
}

/** Best-effort emirate extraction from a free-form location string/object */
export function emirateFromLocation(loc) {
  const s = norm(
    typeof loc === "string"
      ? loc
      : [loc?.city, loc?.state, loc?.country, loc?.location].filter(Boolean).join(", ")
  );
  if (!s) return "";

  // direct emirate match
  for (const e of EMIRATES) {
    if (s.includes(e.toLowerCase())) return e;
  }
  // city -> emirate mapping
  for (const [k, v] of CITY_TO_EMIRATE.entries()) {
    if (s.includes(k)) return v;
  }

  // country-level only
  if (/(united arab emirates|u\.?a\.?e\.?|\buae\b)/i.test(s)) return "United Arab Emirates";
  return "";
}

export default { isUAE, emirateFromLocation };

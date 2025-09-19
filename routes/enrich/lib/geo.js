export const UAE_EMIRATES = [
  { key: "abu dhabi", label: "Abu Dhabi" },
  { key: "dubai", label: "Dubai" },
  { key: "sharjah", label: "Sharjah" },
  { key: "ajman", label: "Ajman" },
  { key: "ras al khaimah", label: "Ras Al Khaimah" },
  { key: "umm al quwain", label: "Umm Al Quwain" },
  { key: "fujairah", label: "Fujairah" },
];
const UAE_KEYS = ["united arab emirates","uae", ...UAE_EMIRATES.map(e => e.key)];

export function emirateFromLocation(loc = "") {
  const s = String(loc).toLowerCase();
  if (!s) return null;
  for (const e of UAE_EMIRATES) {
    if (s.includes(e.key)) return e.label;
  }
  if (s.includes("united arab emirates") || s === "uae") return "UAE";
  return null;
}
export function isUAE(loc = "") {
  const s = String(loc).toLowerCase();
  return UAE_KEYS.some(k => s.includes(k));
}

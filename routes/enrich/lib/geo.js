/**
 * Emirate tagger from a free-text location.
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

export function tagEmirate(location = "") {
  const s = String(location).toLowerCase();
  for (const e of EMIRATES) {
    if (s.includes(e.toLowerCase())) return e;
  }
  if (s.includes("united arab emirates") || s.includes("uae")) return "UAE";
  return "";
}

export default { tagEmirate };

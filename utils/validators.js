// utils/validators.js

// ---- Canonical enums (stored/displayed exactly like this) ----
export const COMPANY_TYPES = ["ALE", "NON_ALE", "Good Coded"];

export const COMPANY_STATUSES = [
  "New",
  "Contacted",
  "Response Received",
  "Converted",
  "Declined",
];

export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Response Received",
  "Follow-up 1",
  "Follow-up 2",
  "Follow-up 3",
  "Follow-up 4",
  "Converted",
  "Declined",
];

export const EMAIL_STATUSES = ["unknown", "patterned", "guessed", "validated", "bounced"];

export const UAE_LOCATIONS = ["Abu Dhabi", "Dubai", "Sharjah"];

// ---- Synonym maps (case/spacing insensitive) ----
// We normalize input then map to a canonical value.
const CTYPE_ALIASES = new Map([
  ["ale", "ALE"],
  ["non_ale", "NON_ALE"],
  ["non-ale", "NON_ALE"],
  ["non ale", "NON_ALE"],
  ["nonale", "NON_ALE"],
  ["good coded", "Good Coded"],
  ["good_coded", "Good Coded"],
  ["good-coded", "Good Coded"],
  ["goodcoded", "Good Coded"],
]);

const CSTATUS_ALIASES = new Map([
  ["new", "New"],
  ["contacted", "Contacted"],
  ["response received", "Response Received"],
  ["response recv", "Response Received"],
  ["response recvd", "Response Received"],
  ["response revd", "Response Received"],
  ["response rcvd", "Response Received"],
  ["response", "Response Received"],
  ["converted", "Converted"],
  ["declined", "Declined"],
]);

const LSTATUS_ALIASES = new Map([
  ["new", "New"],
  ["contacted", "Contacted"],
  ["response received", "Response Received"],
  ["response rcvd", "Response Received"],
  ["response recvd", "Response Received"],
  ["response revd", "Response Received"],
  ["follow-up 1", "Follow-up 1"],
  ["follow up 1", "Follow-up 1"],
  ["f-up 1", "Follow-up 1"],
  ["fup 1", "Follow-up 1"],
  ["follow-up 2", "Follow-up 2"],
  ["follow up 2", "Follow-up 2"],
  ["f-up 2", "Follow-up 2"],
  ["f-up 2 stage", "Follow-up 2"],
  ["fup 2", "Follow-up 2"],
  ["follow-up 3", "Follow-up 3"],
  ["follow up 3", "Follow-up 3"],
  ["f-up 3", "Follow-up 3"],
  ["fup 3", "Follow-up 3"],
  ["follow-up 4", "Follow-up 4"],
  ["follow up 4", "Follow-up 4"],
  ["f-up 4", "Follow-up 4"],
  ["f-up 4 stage", "Follow-up 4"],
  ["fup 4", "Follow-up 4"],
  ["converted", "Converted"],
  ["declined", "Declined"],
]);

const EMAIL_STATUS_ALIASES = new Map([
  ["unknown", "unknown"],
  ["patterned", "patterned"],
  ["guessed", "guessed"],
  ["validated", "validated"],
  ["bounced", "bounced"],
]);

const LOCATION_ALIASES = new Map([
  ["abudhabi", "Abu Dhabi"],
  ["abu dhabi", "Abu Dhabi"],
  ["dubai", "Dubai"],
  ["sharjah", "Sharjah"],
]);

// ---- Helpers ----
function normKey(s) {
  if (!s) return "";
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

// ---- Normalizers (return canonical or null) ----
export function normalizeCompanyType(t) {
  const k = normKey(t);
  if (!k) return null;
  const direct = COMPANY_TYPES.find((v) => normKey(v) === k);
  if (direct) return direct;
  return CTYPE_ALIASES.get(k) ?? null;
}

export function normalizeCompanyStatus(s) {
  const k = normKey(s);
  if (!k) return null;
  const direct = COMPANY_STATUSES.find((v) => normKey(v) === k);
  if (direct) return direct;
  return CSTATUS_ALIASES.get(k) ?? null;
}

export function normalizeLeadStatus(s) {
  const k = normKey(s);
  if (!k) return null;
  const direct = LEAD_STATUSES.find((v) => normKey(v) === k);
  if (direct) return direct;
  return LSTATUS_ALIASES.get(k) ?? null;
}

export function normalizeEmailStatus(s) {
  const k = normKey(s);
  if (!k) return null;
  const direct = EMAIL_STATUSES.find((v) => normKey(v) === k);
  if (direct) return direct;
  return EMAIL_STATUS_ALIASES.get(k) ?? null;
}

export function normalizeLocation(loc) {
  const k = normKey(loc);
  if (!k) return null;
  const direct = UAE_LOCATIONS.find((v) => normKey(v) === k);
  if (direct) return direct;
  return LOCATION_ALIASES.get(k) ?? null;
}

// ---- Boolean validators (backward compatible) ----
export function isValidCompanyType(t) {
  return normalizeCompanyType(t) !== null;
}
export function isValidCompanyStatus(s) {
  return normalizeCompanyStatus(s) !== null;
}
export function isValidEmailStatus(s) {
  return normalizeEmailStatus(s) !== null;
}
export function isValidLeadStatus(s) {
  return normalizeLeadStatus(s) !== null;
}
export function isValidLocation(loc) {
  return normalizeLocation(loc) !== null;
}

// ---- Convenience: normalize an array of locations ----
export function normalizeLocations(list = []) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const n = normalizeLocation(item);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

// utils/validators.js
export const COMPANY_TYPES = ["ALE", "NON_ALE", "Good Coded"];
export const COMPANY_STATUSES = ["New", "Contacted", "Response Received", "Converted", "Declined"];
export const EMAIL_STATUSES = ["unknown", "patterned", "guessed", "validated", "bounced"];
export const LEAD_STATUSES = [
  "New", "Contacted", "Response Received",
  "Follow-up 1", "Follow-up 2", "Follow-up 3", "Follow-up 4",
  "Converted", "Declined"
];
export const UAE_LOCATIONS = ["Abu Dhabi", "Dubai", "Sharjah"];

export function isValidCompanyType(t) { return COMPANY_TYPES.includes(t); }
export function isValidCompanyStatus(s) { return COMPANY_STATUSES.includes(s); }
export function isValidEmailStatus(s) { return EMAIL_STATUSES.includes(s); }
export function isValidLeadStatus(s) { return LEAD_STATUSES.includes(s); }
export function isValidLocation(loc) { return UAE_LOCATIONS.includes(loc); }

// utils/qscore.js
export function computeQScore(company, newsRows = []) {
  let score = 0;
  if (company.type === "ALE") score += 10;
  if (Array.isArray(company.locations) && company.locations.length > 1) score += 5;
  const hiring = newsRows.some(n => Array.isArray(n.tags) && (n.tags.includes("hiring") || n.tags.includes("expansion")));
  if (hiring) score += 15;
  return Math.max(0, Math.min(100, score));
}

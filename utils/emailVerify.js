// utils/emailVerify.js
// Export: verifyEmail(email) -> { status: 'valid' | 'invalid' | 'unknown' }
//
// This is a *safe stub* (no network). Integrate an SMTP verifier later.
// You can flip VALIDATE_DOMAINS env to comma-list to force "valid" for demos.

const FORCE_VALID = new Set(
  (process.env.VALIDATE_DOMAINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

export async function verifyEmail(email) {
  const e = String(email || "").toLowerCase();
  const domain = e.split("@")[1] || "";
  if (!e || !domain) return { status: "unknown" };

  if (FORCE_VALID.has(domain)) return { status: "valid" };

  // Demo rule: obvious fakes -> invalid; else unknown
  if (domain.endsWith(".invalid") || domain.includes("example")) {
    return { status: "invalid" };
  }
  return { status: "unknown" };
}

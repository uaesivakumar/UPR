// utils/emailVerify.js

/**
 * Verify an email address using NeverBounce or ZeroBounce when available.
 * Returns { status: 'valid'|'accept_all'|'unknown'|'invalid'|'bounced', reason?: string }
 */
export async function verifyEmail(email) {
  // NeverBounce
  if (process.env.NEVERBOUNCE_API_KEY) {
    try {
      const resp = await fetch("https://api.neverbounce.com/v4/single/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: process.env.NEVERBOUNCE_API_KEY,
          email,
          address_info: 0,
          credits_info: 0,
        }),
      });
      const data = await resp.json();
      return mapNeverBounce(data?.result || data?.verification?.result);
    } catch {
      return { status: "unknown", reason: "neverbounce_error" };
    }
  }

  // ZeroBounce
  if (process.env.ZEROBOUNCE_API_KEY) {
    try {
      const url = new URL("https://api.zerobounce.net/v2/validate");
      url.searchParams.set("api_key", process.env.ZEROBOUNCE_API_KEY);
      url.searchParams.set("email", email);
      const resp = await fetch(url.toString());
      const data = await resp.json();
      return mapZeroBounce(data?.status);
    } catch {
      return { status: "unknown", reason: "zerobounce_error" };
    }
  }

  // Fallback — syntax only
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "invalid", reason: "regex" };
  return { status: "unknown", reason: "no_verifier_configured" };
}

function mapNeverBounce(code) {
  switch (String(code).toLowerCase()) {
    case "valid":
      return { status: "valid" };
    case "catchall":
    case "unknown":
    case "accept_all":
      return { status: "accept_all" };
    case "invalid":
      return { status: "invalid" };
    case "disposable":
      return { status: "invalid", reason: "disposable" };
    case "do_not_mail":
      return { status: "invalid", reason: "do_not_mail" };
    default:
      return { status: "unknown" };
  }
}
function mapZeroBounce(code) {
  switch (String(code).toLowerCase()) {
    case "valid":
      return { status: "valid" };
    case "catch-all":
    case "unknown":
    case "accept_all":
      return { status: "accept_all" };
    case "invalid":
      return { status: "invalid" };
    default:
      return { status: "unknown" };
  }
}

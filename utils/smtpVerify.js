// utils/smtpVerify.js
import dns from "dns/promises";

export async function verifyEmailNoSend(email) {
  // Very light check: syntax + domain MX presence
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) {
    return { status: "bounced", reason: "invalid_syntax" };
  }
  const domain = email.split("@")[1].toLowerCase();
  try {
    const mx = await dns.resolveMx(domain);
    if (!mx || mx.length === 0) {
      return { status: "bounced", reason: "no_mx" };
    }
    // We only confirm deliverability possibility, not mailbox existence
    return { status: "validated", reason: "mx_present" };
  } catch {
    return { status: "bounced", reason: "mx_error" };
  }
}

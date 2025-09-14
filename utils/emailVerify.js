// utils/emailVerify.js
// Lightweight SMTP "RCPT TO" probe to estimate deliverability.
// NOTE: Many providers block or fake this. Treat as a signal, not ground truth.

import dns from "node:dns/promises";
import net from "node:net";

const SMTP_PORT = 25;
const CONNECT_TIMEOUT_MS = Number(process.env.SMTP_CONNECT_TIMEOUT_MS || 6000);
const COMMAND_TIMEOUT_MS = Number(process.env.SMTP_COMMAND_TIMEOUT_MS || 6000);
const HELO_DOMAIN = process.env.HELO_DOMAIN || "example.com";
const MAIL_FROM = process.env.VERIFY_FROM || "verify@example.com";

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) =>
    (t = setTimeout(() => rej(new Error(`${label} timeout`)), ms))
  );
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

export async function resolveMx(domain) {
  try {
    const recs = await dns.resolveMx(domain);
    return recs.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  } catch {
    return [];
  }
}

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d) => {
      buf += d.toString();
      // SMTP replies end with \r\n and code + space (not hyphen continuation)
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      // e.g., "250-..." (more) or "250 ..." (final)
      const m = last.match(/^(\d{3})[ -]/);
      if (m && last.includes(" ")) {
        cleanup();
        resolve({ code: Number(m[1]), text: buf });
      }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const onClose = () => { cleanup(); reject(new Error("socket closed")); };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onErr);
      socket.off("close", onClose);
    };
    socket.on("data", onData);
    socket.on("error", onErr);
    socket.on("close", onClose);
  });
}

async function send(socket, cmd) {
  socket.write(cmd + "\r\n");
  const { code, text } = await withTimeout(readLine(socket), COMMAND_TIMEOUT_MS, `SMTP ${cmd.split(" ")[0]}`);
  return { code, text };
}

async function tryHost(mxHost, email) {
  const log = [];
  const socket = new net.Socket();

  try {
    await withTimeout(new Promise((res, rej) => {
      socket.once("error", rej);
      socket.connect(SMTP_PORT, mxHost, res);
    }), CONNECT_TIMEOUT_MS, "connect");

    // greeting
    let r = await withTimeout(readLine(socket), COMMAND_TIMEOUT_MS, "banner");
    log.push(`BANNER ${r.code}`);

    r = await send(socket, `EHLO ${HELO_DOMAIN}`);
    log.push(`EHLO ${r.code}`);

    r = await send(socket, `MAIL FROM:<${MAIL_FROM}>`);
    log.push(`MAIL FROM ${r.code}`);

    r = await send(socket, `RCPT TO:<${email}>`);
    log.push(`RCPT TO ${r.code}`);

    // Interpret RCPT code
    // 250/251/252 => accepted/forward/unknown but accepted (treat as valid-ish)
    // 450/451/452 => temp failures (unknown)
    // 550/551/553 => mailbox not found/relaying denied (invalid)
    // 521/554/5xx misc => unknown/blocked
    let status = "unknown";
    if ([250, 251, 252].includes(r.code)) status = "valid";
    else if ([550, 551, 553].includes(r.code)) status = "invalid";
    else status = "unknown";

    try { await send(socket, "QUIT"); } catch {}
    socket.destroy();
    return { hostTried: mxHost, status, log };
  } catch (e) {
    try { socket.destroy(); } catch {}
    log.push(`ERROR ${e.message || e}`);
    return { hostTried: mxHost, status: "unknown", log };
  }
}

export async function verifyEmail(email) {
  const out = { email, status: "unknown", mxHost: null, log: [] };

  const domain = String(email).split("@")[1];
  if (!domain) return out;

  const mx = await resolveMx(domain);
  if (!mx.length) {
    out.log.push("No MX found");
    return out;
  }

  for (const rec of mx.slice(0, 3)) { // try up to 3
    const r = await tryHost(rec.exchange, email);
    out.log.push(`[${r.hostTried}] -> ${r.status}`);
    if (r.status !== "unknown") {
      out.status = r.status;
      out.mxHost = r.hostTried;
      break;
    }
  }
  return out;
}

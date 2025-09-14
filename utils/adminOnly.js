// utils/adminOnly.js
import { verifyJwt } from "./jwt.js";

const STATIC_ADMIN_TOKEN = process.env.ADMIN_TOKEN || null; // kept for backward-compat
const ADMIN_USER = process.env.ADMIN_USER || null;
const ADMIN_PASS = process.env.ADMIN_PASS || null;

export function adminOnly(req, res, next) {
  // 1) Bearer or x-admin-token (preferred: signed JWT)
  let token = null;
  const auth = req.headers["authorization"];
  if (auth && typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    token = auth.slice(7).trim();
  }
  if (!token && req.headers["x-admin-token"]) {
    token = String(req.headers["x-admin-token"]);
  }

  if (token) {
    // Back-compat: allow exact static token if set
    if (STATIC_ADMIN_TOKEN && token === STATIC_ADMIN_TOKEN) {
      return next();
    }
    // JWT path
    const payload = verifyJwt(token);
    if (payload && payload.role === "admin") {
      return next();
    }
  }

  // 2) Optional Basic auth (works with ADMIN_USER/ADMIN_PASS)
  if (ADMIN_USER && ADMIN_PASS && auth && auth.startsWith("Basic ")) {
    const b64 = auth.slice(6);
    try {
      const [u, p] = Buffer.from(b64, "base64").toString("utf8").split(":", 2);
      if (u === ADMIN_USER && p === ADMIN_PASS) return next();
    } catch {
      /* ignore */
    }
  }

  res.status(401).json({ ok: false, error: "Unauthorized" });
}

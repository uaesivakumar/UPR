// utils/adminOnly.js
import { verifyJwt, getTokenFromReq } from "./jwt.js";

export function adminOnly(req, res, next) {
  const token = getTokenFromReq(req);
  let ok = false;

  // 1) Prefer JWT Bearer token
  if (token && !token.includes("@")) {
    const payload = verifyJwt(token);
    if (payload && (payload.role === "admin" || payload.isAdmin)) {
      req.user = payload;
      ok = true;
    }
  }

  // 2) Back-compat: accept legacy ADMIN_TOKEN header if present
  if (!ok && process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN) {
    req.user = { role: "admin", method: "legacy-token" };
    ok = true;
  }

  if (!ok) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  next();
}

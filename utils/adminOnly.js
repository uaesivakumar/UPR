// utils/adminOnly.js
import { verifyJwt } from "./jwt.js";

export function adminOnly(req, res, next) {
  try {
    const h = String(req.headers.authorization || "");
    if (!h.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "missing bearer" });
    }
    const token = h.slice("Bearer ".length);
    const payload = verifyJwt(token);
    if (!payload || payload.role !== "admin") {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: "invalid token" });
  }
}

// utils/adminOnly.js
import { getJwtFromRequest, verifyJwt } from "./jwt.js";

export function adminOnly(req, res, next) {
  const token = getJwtFromRequest(req);
  if (!token) return res.status(401).json({ ok: false, error: "unauthorized" });
  const decoded = verifyJwt(token);
  if (!decoded) return res.status(401).json({ ok: false, error: "unauthorized" });

  req.user = decoded; // { sub, role, iat, exp, ... }
  return next();
}

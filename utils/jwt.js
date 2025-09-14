// utils/jwt.js
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DEFAULT_EXPIRES = process.env.JWT_EXPIRES_IN || "7d";

export function signJwt(payload, opts = {}) {
  return jwt.sign(payload, SECRET, {
    algorithm: "HS256",
    expiresIn: DEFAULT_EXPIRES,
    ...opts,
  });
}

export function verifyJwt(token) {
  try {
    return jwt.verify(token, SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}

export function getTokenFromReq(req) {
  const h = req.headers || {};
  const auth = h.authorization || h.Authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const legacy = h["x-admin-token"] || h["X-Admin-Token"];
  return legacy ? String(legacy) : null;
}

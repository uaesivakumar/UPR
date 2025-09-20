// utils/jwt.js
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev_upr_secret";
const COOKIE_NAME = "upr_session";

export function signJwt(payload, expiresIn = "12h") {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyJwt(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/** Read JWT from Authorization: Bearer … header OR from HttpOnly cookie. */
export function getJwtFromRequest(req) {
  const h = req.headers?.authorization || req.headers?.Authorization;
  if (h && typeof h === "string" && h.startsWith("Bearer ")) {
    return h.slice("Bearer ".length).trim();
  }
  // cookie-parser populates req.cookies
  const c = req.cookies?.[COOKIE_NAME];
  if (c) return c;
  return null;
}

export function setSessionCookie(res, token, hours = 12) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: hours * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production";
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

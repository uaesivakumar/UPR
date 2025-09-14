// utils/jwt.js
import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.APP_SECRET ||
  "dev-secret-change-me-please";

export function signJwt(payload, expiresInSec = 60 * 60 * 24 * 7) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSec });
}

export function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}

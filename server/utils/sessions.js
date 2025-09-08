// server/utils/sessions.js
import crypto from "crypto";

const SESSIONS = new Set();

export const makeToken = () => crypto.randomUUID();
export const addSession = (token) => SESSIONS.add(token);
export const removeSession = (token) => SESSIONS.delete(token);
export const hasSession = (token) => SESSIONS.has(token);

export const readBearer = (req) => {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
};

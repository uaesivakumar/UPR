// server/middleware/requireSession.js
import { hasSession, readBearer } from "../utils/sessions.js";

export default function requireSession(req, res, next) {
  const token = readBearer(req);
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  if (!hasSession(token)) return res.status(401).json({ ok: false, error: "Invalid session" });
  req.sessionToken = token;
  next();
}

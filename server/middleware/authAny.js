// server/middleware/authAny.js
import { verifyToken } from "../../utils/jwt.js";

export default function authAny(req, res, next) {
  // 1) Cookie-based session
  if (req?.session?.user) {
    req.user = req.session.user;
    return next();
  }

  // 2) Bearer JWT
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m) {
    try {
      const payload = verifyToken(m[1]); // utils/jwt.js
      if (payload) {
        req.user = { id: payload.sub, role: payload.role, ...payload };
        return next();
      }
    } catch (e) {
      // fall through to 401
    }
  }

  // 3) Unauthorized
  return res.status(401).json({ ok: false, error: "unauthorized" });
}

// utils/adminOnly.js
export function adminOnly(req, res, next) {
  try {
    const header = req.header("x-admin-token");
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
      return res.status(500).json({ ok: false, error: "ADMIN_TOKEN not configured" });
    }
    if (!header || header !== expected) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    next();
  } catch (e) {
    console.error("adminOnly error", e);
    return res.status(500).json({ ok: false, error: "server error" });
  }
}

export function adminOnly(req, res, next) {
  const token =
    req.get("x-admin-token") ||
    req.get("X-Admin-Token") ||
    req.headers["x-admin-token"];

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  next();
}

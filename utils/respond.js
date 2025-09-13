// utils/respond.js
export function ok(res, data) {
  return res.json({ ok: true, data });
}
export function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

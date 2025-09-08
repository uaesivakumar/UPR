// server/routes/auth.js
import express from "express";
import { ADMIN_USERNAME, ADMIN_PASSWORD } from "../config.js";
import { makeToken, addSession, removeSession, readBearer } from "../utils/sessions.js";

const router = express.Router();

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = makeToken();
    addSession(token);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: "Invalid credentials" });
});

router.post("/logout", (req, res) => {
  const t = readBearer(req);
  if (t) removeSession(t);
  res.json({ ok: true });
});

export default router;

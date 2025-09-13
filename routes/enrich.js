// routes/enrich.js
import express from "express";
import { ok, bad } from "../utils/respond.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input) return bad(res, "input required");
    const domain = input.replace(/^https?:\/\//, "").split("/")[0] || "example.com";
    const company = { name: domain.split(".")[0].toUpperCase(), domain, linkedin_url: null };
    const contacts = [
      { name: "HR Director", title: "HR Director", linkedin_url: null, email_guess: `hr@${domain}`, score: 82, email_status: "patterned" },
      { name: "TA Manager", title: "Talent Acquisition Manager", linkedin_url: null, email_guess: `careers@${domain}`, score: 71, email_status: "patterned" },
      { name: "Payroll Lead", title: "Payroll Lead", linkedin_url: null, email_guess: `payroll@${domain}`, score: 68, email_status: "patterned" }
    ];
    return ok(res, { company, contacts });
  } catch (e) {
    console.error(e);
    return bad(res, "server error", 500);
  }
});

export default router;

import express from "express";
import { pool } from "../utils/db.js";
import buildSearchRouter from "./enrich/search.js";
import buildEnrichCompanyRouter from "./enrich/enrichCompany.js";

const router = express.Router();

// Status ping (LLM/DB/Data source)
router.get("/status", async (_req, res) => {
  const llm_ok = !!process.env.OPENAI_API_KEY;
  const data_source = process.env.APOLLO_API_KEY || process.env.APOLLOIO_API_KEY || process.env.APOLLO_TOKEN ? "live" : "mock";
  let db_ok = false;
  try { await pool.query("SELECT 1"); db_ok = true; } catch { db_ok = false; }
  res.json({ ok: true, data: { db_ok, llm_ok, data_source } });
});

// Mount sub-routers
router.use(buildSearchRouter({ pool }));
router.use(buildEnrichCompanyRouter({ pool }));

export default router;

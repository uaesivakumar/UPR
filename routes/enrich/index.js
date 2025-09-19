import express from "express";
import searchRouter from "./search.js";
import enrichCompanyRouter from "./enrichCompany.js";

/**
 * /api/enrich router
 *   - POST /             -> enrichCompanyRouter (create enrichment from company_id)
 *   - GET  /status       -> enrichCompanyRouter (optional status endpoint, if present)
 *   - GET  /search       -> searchRouter (LLM + Apollo live search by query)
 */
const router = express.Router();

// Mount the sub-routers as-is. They each define their own paths:
// - enrichCompanyRouter should expose POST "/" (and maybe GET "/status")
// - searchRouter should expose GET "/" which becomes "/search"
router.use("/", enrichCompanyRouter);
router.use("/search", searchRouter);

export default router;

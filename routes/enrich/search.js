// routes/enrich/search.js
import { performance } from "node:perf_hooks";

// Best-effort helper: pick the first callable from a list of candidate names
function pickFn(mod, candidates = []) {
  if (!mod) return null;
  for (const name of candidates) {
    const fn = mod?.[name];
    if (typeof fn === "function") return { name, fn };
  }
  return null;
}

function noStore(res) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");
}

// Normalize contacts to the shape the UI expects
function normalizeContacts(arr = []) {
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => ({
    name: c.name ?? c.full_name ?? c.person ?? "—",
    designation: c.designation ?? c.title ?? c.role ?? undefined,
    title: c.title ?? c.designation ?? c.role ?? undefined,
    email: c.email ?? c.work_email ?? undefined,
    linkedin_url: c.linkedin_url ?? c.linkedin ?? c.linkedinProfile ?? undefined,
    emirate: c.emirate ?? c.location ?? undefined,
    confidence: typeof c.confidence === "number" ? c.confidence : undefined,
    email_status: c.email_status ?? c.verification ?? undefined,
    source: c.source ?? c.provider ?? "enrich",
  }));
}

export default async function enrichSearchHandler(req, res) {
  noStore(res);

  const rid = req._reqid || Math.random().toString(36).slice(2, 8);
  const q = (req.query?.q ?? "").toString().trim();
  const overrides = {
    name: (req.query?.name ?? "").toString().trim() || undefined,
    domain: (req.query?.domain ?? "").toString().trim() || undefined,
    linkedin_url: (req.query?.linkedin_url ?? "").toString().trim() || undefined,
    parent: (req.query?.parent ?? "").toString().trim() || undefined,
  };
  const userId = req.userId || req.user?.id || "anon";

  console.log(`[${rid}] enrich/search hit (GET) q=${JSON.stringify(q)} overrides=${JSON.stringify(overrides)} user=${userId}`);

  const timings = {};
  const summary = {
    provider: "live",
    company_guess: q ? { name: q } : undefined,
    quality: { score: 0.5, explanation: "Heuristic guess based on input." },
    timings,
  };

  // Try providers in this order: Apollo -> LLM
  let results = [];
  let usedProvider = null;

  // --- Try APOLLO (if present) ---
  let apollo = null;
  try {
    apollo = await import("./lib/apollo.js").catch(() => null);
    console.log(`[${rid}] provider: apollo loaded=${!!apollo} keys=${apollo ? Object.keys(apollo).join(",") : "-"}`);
  } catch (e) {
    console.error(`[${rid}] provider: apollo import error`, e?.stack || e);
  }

  if (!results.length && apollo) {
    const candidate = pickFn(apollo, [
      // common function name candidates; we’ll log what exists above
      "searchPeopleByCompany",
      "searchPeople",
      "search",
      "findPeople",
      "run",
    ]);
    if (candidate) {
      const t0 = performance.now();
      try {
        console.log(`[${rid}] apollo.${candidate.name} → start`);
        const r = await candidate.fn({ q, ...overrides });
        timings.provider_ms = Math.round(performance.now() - t0);
        const normalized = normalizeContacts(r?.results ?? r);
        console.log(`[${rid}] apollo.${candidate.name} → ok count=${normalized.length} in ${timings.provider_ms}ms`);
        if (normalized.length) {
          results = normalized.map((x) => ({ ...x, source: x.source ?? "apollo" }));
          usedProvider = "apollo";
        }
      } catch (e) {
        timings.provider_ms = Math.round(performance.now() - t0);
        console.error(`[${rid}] apollo.${candidate.name} → error after ${timings.provider_ms}ms`, e?.stack || e);
      }
    } else {
      console.log(`[${rid}] apollo: no callable function found; exposed keys=${Object.keys(apollo).join(",")}`);
    }
  }

  // --- Try LLM (if present and still empty) ---
  let llm = null;
  if (!results.length) {
    try {
      llm = await import("./lib/llm.js").catch(() => null);
      console.log(`[${rid}] provider: llm loaded=${!!llm} keys=${llm ? Object.keys(llm).join(",") : "-"}`);
    } catch (e) {
      console.error(`[${rid}] provider: llm import error`, e?.stack || e);
    }

    if (llm) {
      const candidate = pickFn(llm, [
        "enrichContactsLLM",
        "search",
        "run",
        "generateContacts",
      ]);
      if (candidate) {
        const t0 = performance.now();
        try {
          console.log(`[${rid}] llm.${candidate.name} → start`);
          const r = await candidate.fn({ q, ...overrides });
          timings.llm_ms = Math.round(performance.now() - t0);
          const normalized = normalizeContacts(r?.results ?? r);
          console.log(`[${rid}] llm.${candidate.name} → ok count=${normalized.length} in ${timings.llm_ms}ms`);
          if (normalized.length) {
            results = normalized.map((x) => ({ ...x, source: x.source ?? "llm" }));
            usedProvider = usedProvider || "llm";
          }
        } catch (e) {
          timings.llm_ms = Math.round(performance.now() - t0);
          console.error(`[${rid}] llm.${candidate.name} → error after ${timings.llm_ms}ms`, e?.stack || e);
        }
      } else {
        console.log(`[${rid}] llm: no callable function found; exposed keys=${llm ? Object.keys(llm).join(",") : "-"}`);
      }
    }
  }

  // Finalize summary
  if (usedProvider) summary.provider = usedProvider;

  // If still empty, return clean 200 with empty payload (UI shows "No results.")
  if (!Array.isArray(results) || results.length === 0) {
    console.log(`[${rid}] enrich/search → no results (provider=${summary.provider}, q=${JSON.stringify(q)})`);
    return res.status(200).json({
      ok: true,
      data: { results: [], summary },
    });
  }

  console.log(`[${rid}] enrich/search → returning ${results.length} result(s) provider=${summary.provider}`);
  return res.status(200).json({
    ok: true,
    data: { results, summary },
  });
}

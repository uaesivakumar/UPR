// workers/sourcingWorker.js
import { pool } from "../utils/db.js";
import { verifyEmailNoSend } from "../utils/smtpVerify.js";
import { commonCandidates, inferPatternFromKnown } from "../utils/emailPattern.js";

/**
 * Placeholder “fetch” that returns a few plausible HR titles.
 * Replace with LinkedIn API / data provider / LLM-backed fetcher.
 */
async function fetchCandidatesForCompany(company) {
  // Return normalized candidates: {name, title, linkedin_url?, dept?, confidence}
  return [
    { name: "HR Director", title: "HR Director", confidence: 0.82 },
    { name: "Talent Acquisition Manager", title: "Talent Acquisition Manager", confidence: 0.71 },
    { name: "Payroll Lead", title: "Payroll Lead", confidence: 0.68 },
  ];
}

async function getCompany(company_id) {
  const r = await pool.query("SELECT * FROM targeted_companies WHERE id=$1", [company_id]);
  return r.rows[0] || null;
}

async function getKnownValidEmailForDomain(domain) {
  if (!domain) return null;
  const r = await pool.query(
    `SELECT email FROM hr_leads
      WHERE email IS NOT NULL AND email_status='validated' AND split_part(email,'@',2)=LOWER($1)
      ORDER BY updated_at DESC LIMIT 1`,
    [domain]
  );
  return r.rowCount ? r.rows[0].email : null;
}

async function upsertLead(company_id, c, emailGuess, emailStatus) {
  // dedupe by linkedin_url if present else (name+title)
  let existing = null;
  if (c.linkedin_url) {
    const r = await pool.query(
      `SELECT id FROM hr_leads WHERE company_id=$1 AND LOWER(COALESCE(linkedin_url,''))=LOWER($2) LIMIT 1`,
      [company_id, c.linkedin_url]
    );
    existing = r.rowCount ? r.rows[0].id : null;
  } else {
    const r = await pool.query(
      `SELECT id FROM hr_leads
         WHERE company_id=$1
           AND LOWER(COALESCE(name,''))=LOWER($2)
           AND LOWER(COALESCE(designation,''))=LOWER($3)
         LIMIT 1`,
      [company_id, c.name || "", c.title || ""]
    );
    existing = r.rowCount ? r.rows[0].id : null;
  }

  if (existing) {
    await pool.query(
      `UPDATE hr_leads
          SET email=COALESCE($1,email),
              email_status=COALESCE($2,email_status),
              designation=COALESCE($3,designation),
              linkedin_url=COALESCE($4,linkedin_url),
              updated_at=now()
        WHERE id=$5`,
      [emailGuess, emailStatus, c.title || null, c.linkedin_url || null, existing]
    );
    return existing;
  }

  const ins = await pool.query(
    `INSERT INTO hr_leads
      (company_id, name, designation, linkedin_url, location, email, email_status, lead_status, status_remarks)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [
      company_id,
      c.name || null,
      c.title || null,
      c.linkedin_url || null,
      null, // location unknown here
      emailGuess || null,
      emailStatus || (emailGuess ? "patterned" : "unknown"),
      "New",
      "Sourced automatically"
    ]
  );
  return ins.rows[0].id;
}

async function processOneJob(client) {
  // claim one pending job with SKIP LOCKED
  const { rows } = await client.query(
    `WITH j AS (
       SELECT id FROM sourcing_jobs
        WHERE status='pending'
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE sourcing_jobs s
        SET status='running', attempts=s.attempts+1, started_at=now()
      FROM j
     WHERE s.id=j.id
     RETURNING s.*`
  );
  if (rows.length === 0) return false;
  const job = rows[0];

  try {
    const company = await getCompany(job.company_id);
    if (!company) throw new Error("company_not_found");

    const domain =
      (company.website_url || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ||
      null;

    const candidates = await fetchCandidatesForCompany(company);

    // Pattern learning from prior validated address (same domain)
    const prior = await getKnownValidEmailForDomain(domain);
    const patternFn = prior ? inferPatternFromKnown(prior, "First Last") : null;

    for (const c of candidates) {
      let guess = null;
      if (patternFn && domain) {
        guess = patternFn(c.name, domain);
      } else if (domain) {
        const picks = commonCandidates(c.name, domain);
        guess = picks[0] || null;
      }

      let status = null;
      if (guess) {
        const v = await verifyEmailNoSend(guess);
        status = v.status; // validated | bounced
        if (status === "bounced") {
          // fall back to next candidate pattern if any
          if (!patternFn && domain) {
            const alt = commonCandidates(c.name, domain).slice(1);
            for (const g of alt) {
              const vv = await verifyEmailNoSend(g);
              if (vv.status === "validated") { guess = g; status = "validated"; break; }
            }
          }
        }
        if (!status) status = "patterned";
      } else {
        status = "unknown";
      }

      await upsertLead(job.company_id, c, guess, status);
    }

    await client.query(
      `UPDATE sourcing_jobs SET status='done', finished_at=now(), error_text=NULL WHERE id=$1`,
      [job.id]
    );
  } catch (e) {
    await client.query(
      `UPDATE sourcing_jobs SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
                               finished_at=now(),
                               error_text=$2
        WHERE id=$1`,
      [job.id, String(e?.message || e)]
    );
  }
  return true;
}

export function startSourcingWorker() {
  const intervalMs = Number(process.env.SOURCING_POLL_MS || 5000);

  const tick = async () => {
    const client = await pool.connect();
    try {
      // process as many jobs as allowed (concurrency=1 per instance)
      let progressed = true;
      let guard = 0;
      while (progressed && guard < 10) {
        await client.query("BEGIN");
        progressed = await processOneJob(client);
        await client.query("COMMIT");
        guard++;
      }
    } catch (e) {
      try { await pool.query("ROLLBACK"); } catch {}
    } finally {
      client.release();
    }
  };

  setInterval(tick, intervalMs);
  // run once shortly after boot
  setTimeout(tick, 1500);
}

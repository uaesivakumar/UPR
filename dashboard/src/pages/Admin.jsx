// dashboard/src/pages/Admin.jsx
import { useEffect, useMemo, useState } from "react";
import { adminFetch, getAdminToken, setAdminToken } from "../utils/auth";

export default function Admin() {
  const [token, setToken] = useState("");
  const [busy1, setBusy1] = useState(false);
  const [busy2, setBusy2] = useState(false);
  const [resp1, setResp1] = useState("");
  const [resp2, setResp2] = useState("");

  useEffect(() => {
    setToken(getAdminToken());
  }, []);

  const exampleEnrichment = useMemo(
    () => ({
      company: {
        name: "G42",
        type: "ALE",
        locations: ["Abu Dhabi"],
        website_url: "https://g42.ai",
        linkedin_url: "https://www.linkedin.com/company/g42ai/",
      },
      contact: {
        name: "Jane HR",
        designation: "Head of Talent",
        linkedin_url: "https://linkedin.com/in/jane-doe",
        location: "Abu Dhabi",
        email: "jane.doe@g42.ai",
        email_status: "guessed",
      },
      status: "Contacted",
      notes: "Imported from admin UI test",
    }),
    []
  );

  const exampleBulk = useMemo(
    () => ({
      items: [
        {
          company_name: "G42",
          name: "John Smith",
          designation: "Recruitment Lead",
          linkedin_url: "https://linkedin.com/in/john-smith",
          location: "Dubai",
          email: "john.smith@g42.ai",
          email_status: "patterned",
          lead_status: "New",
        },
        {
          company_name: "ADNOC",
          name: "Sara Ali",
          designation: "TA Manager",
          location: "Abu Dhabi",
          email_status: "unknown",
        },
      ],
    }),
    []
  );

  const [payload1, setPayload1] = useState(JSON.stringify(exampleEnrichment, null, 2));
  const [payload2, setPayload2] = useState(JSON.stringify(exampleBulk, null, 2));

  function saveToken() {
    setAdminToken(token.trim());
    alert("Admin token saved.");
  }

  async function callFromEnrichment() {
    setBusy1(true);
    setResp1("");
    try {
      const res = await adminFetch("/api/hr-leads/from-enrichment", {
        method: "POST",
        body: payload1,
      });
      const text = await res.text();
      setResp1(text);
    } catch (e) {
      setResp1(String(e));
    } finally {
      setBusy1(false);
    }
  }

  async function callBulk() {
    setBusy2(true);
    setResp2("");
    try {
      const res = await adminFetch("/api/hr-leads/bulk", {
        method: "POST",
        body: payload2,
      });
      const text = await res.text();
      setResp2(text);
    } catch (e) {
      setResp2(String(e));
    } finally {
      setBusy2(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Admin Tools</h1>
        <p className="text-sm text-gray-500">
          Provide your admin token, then exercise admin-only endpoints.
        </p>
      </header>

      <section className="bg-white rounded-xl shadow p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Admin Token</h2>
        <div className="flex gap-3 items-center">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="paste ADMIN_TOKEN"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2"
          />
          <button
            onClick={saveToken}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 font-medium hover:bg-gray-800"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Stored in <code>localStorage.ADMIN_TOKEN</code>.
        </p>
      </section>

      <section className="bg-white rounded-xl shadow p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">POST /api/hr-leads/from-enrichment</h2>
          <button
            onClick={callFromEnrichment}
            disabled={busy1}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800 disabled:opacity-60"
          >
            {busy1 ? "Sending…" : "Send"}
          </button>
        </div>
        <textarea
          className="w-full min-h-[220px] border rounded-xl px-3 py-2 font-mono text-sm"
          value={payload1}
          onChange={(e) => setPayload1(e.target.value)}
        />
        <div className="text-xs uppercase text-gray-400">Response</div>
        <pre className="w-full min-h-[120px] border rounded-xl p-3 bg-gray-50 overflow-auto text-xs">
{resp1 || ""}
        </pre>
      </section>

      <section className="bg-white rounded-xl shadow p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">POST /api/hr-leads/bulk</h2>
          <button
            onClick={callBulk}
            disabled={busy2}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm hover:bg-gray-800 disabled:opacity-60"
          >
            {busy2 ? "Sending…" : "Send"}
          </button>
        </div>
        <textarea
          className="w-full min-h-[220px] border rounded-xl px-3 py-2 font-mono text-sm"
          value={payload2}
          onChange={(e) => setPayload2(e.target.value)}
        />
        <div className="text-xs uppercase text-gray-400">Response</div>
        <pre className="w-full min-h-[120px] border rounded-xl p-3 bg-gray-50 overflow-auto text-xs">
{resp2 || ""}
        </pre>
      </section>
    </div>
  );
}

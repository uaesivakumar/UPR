// dashboard/src/pages/Admin.jsx
import { useEffect, useState } from "react";
import { authFetch, logout } from "../utils/auth";

export default function Admin() {
  const [verifyMsg, setVerifyMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // demo payloads
  const [enrichmentJson, setEnrichmentJson] = useState(() =>
    JSON.stringify(
      {
        company: {
          name: "Acme Corp",
          type: "Private",
          locations: ["Dubai"],
          website_url: "https://acme.example",
          linkedin_url: "https://www.linkedin.com/company/acme",
        },
        contact: {
          name: "Jane Doe",
          designation: "HR Director",
          linkedin_url: "https://www.linkedin.com/in/janedoe",
          location: "Dubai",
          email: "jane.doe@acme.example",
          email_status: "validated",
        },
        status: "New",
        notes: "Saved from Admin page",
      },
      null,
      2
    )
  );

  const [bulkJson, setBulkJson] = useState(() =>
    JSON.stringify(
      [
        {
          company: {
            name: "Beta LLC",
            locations: ["Abu Dhabi"],
            website_url: "https://beta.example",
          },
          contact: { name: "Ali Khan", designation: "TA Manager", email: null },
          status: "New",
          notes: "Bulk import 1",
        },
        {
          company: { name: "Gamma FZ-LLC", locations: ["Dubai"] },
          contact: { name: "Sara Lee", designation: "HRBP", email: "sara@gamma.example" },
          status: "New",
          notes: "Bulk import 2",
        },
      ],
      null,
      2
    )
  );

  useEffect(() => {
    // quick verify on load (optional)
    (async () => {
      try {
        const res = await authFetch("/api/admin/verify");
        setVerifyMsg(res.ok ? "✅ Admin verified" : "❌ Not authorized");
      } catch {
        setVerifyMsg("❌ Not authorized");
      }
    })();
  }, []);

  async function doVerify() {
    setBusy(true);
    setVerifyMsg("");
    try {
      const res = await authFetch("/api/admin/verify");
      setVerifyMsg(res.ok ? "✅ Admin verified" : "❌ Not authorized");
    } catch (e) {
      setVerifyMsg("❌ Not authorized");
    } finally {
      setBusy(false);
    }
  }

  async function saveFromEnrichment() {
    setBusy(true);
    try {
      let payload;
      try {
        payload = JSON.parse(enrichmentJson);
      } catch {
        alert("Enrichment JSON is invalid.");
        return;
      }
      const res = await authFetch("/api/hr-leads/from-enrichment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Save failed");
      alert("Saved ✅");
    } catch (e) {
      alert(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkImport() {
    setBusy(true);
    try {
      let rows;
      try {
        rows = JSON.parse(bulkJson);
        if (!Array.isArray(rows)) throw new Error("Bulk JSON must be an array");
      } catch (e) {
        alert(e.message || "Bulk JSON is invalid.");
        return;
      }
      const res = await authFetch("/api/hr-leads/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const data = await safeJson(res);
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Bulk import failed");
      alert(`Imported ${data.count ?? rows.length} rows ✅`);
    } catch (e) {
      alert(e?.message || "Bulk import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
        <p className="text-sm text-gray-500">
          You’re authenticated with username/password. Admin actions below use your JWT automatically.
        </p>
      </header>

      <section className="bg-white rounded-xl shadow p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Session</h2>
          <div className="flex gap-2">
            <button
              onClick={doVerify}
              disabled={busy}
              className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-60"
            >
              Verify Admin
            </button>
            <button
              onClick={() => logout()}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Logout
            </button>
          </div>
        </div>
        <p className="text-sm">{verifyMsg}</p>
      </section>

      <section className="bg-white rounded-xl shadow p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Save From Enrichment JSON</h2>
        <p className="text-sm text-gray-500">
          POST <code className="bg-gray-100 px-1 rounded">/api/hr-leads/from-enrichment</code>
        </p>
        <textarea
          className="w-full min-h-[220px] border rounded-xl px-3 py-2 font-mono text-xs"
          value={enrichmentJson}
          onChange={(e) => setEnrichmentJson(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            onClick={saveFromEnrichment}
            disabled={busy}
            className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow p-5 space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Bulk Import</h2>
        <p className="text-sm text-gray-500">
          POST <code className="bg-gray-100 px-1 rounded">/api/hr-leads/bulk</code> with{" "}
          <code className="bg-gray-100 px-1 rounded">{`{ items: [...] }`}</code>
        </p>
        <textarea
          className="w-full min-h-[220px] border rounded-xl px-3 py-2 font-mono text-xs"
          value={bulkJson}
          onChange={(e) => setBulkJson(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            onClick={bulkImport}
            disabled={busy}
            className="rounded-lg bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-60"
          >
            Import
          </button>
        </div>
      </section>
    </div>
  );
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

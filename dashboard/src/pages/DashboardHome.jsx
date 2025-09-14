// dashboard/src/pages/DashboardHome.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../utils/auth";

function num(n) {
  const v = Number(n || 0);
  return isNaN(v) ? 0 : v;
}
function fmtDT(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    return d.toLocaleString();
  } catch {
    return String(v);
  }
}
function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${tones[tone] || tones.gray}`}>
      {children}
    </span>
  );
}

export default function DashboardHome() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await authFetch("/api/stats");
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(j?.error || "Failed to load stats");
        if (mounted) setStats(j.data || {});
      } catch (e) {
        if (mounted) setErr(e?.message || "Failed to load stats");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  const totals = stats?.totals || {};
  const last7 = stats?.last7d || {};
  const recent = stats?.recent_leads || [];
  const llm = stats?.meta?.llm || null;

  const cards = [
    { label: "Companies Tracked", value: num(totals.companies) },
    { label: "Leads Identified", value: num(totals.leads) },
    { label: "Outreach Sent", value: num(totals.outreach) },
    { label: "New Leads (7d)", value: num(last7.new_leads) },
  ];

  return (
    <div className="space-y-8">
      {/* Header — no page-level search bar here to avoid duplicates */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Overview of companies, leads, and outreach performance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {llm && <Badge tone="green">LLM active: {llm}</Badge>}
          <button
            onClick={() => nav("/enrichment")}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 font-medium hover:bg-gray-800"
          >
            + Add Lead
          </button>
        </div>
      </div>

      {/* Top cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl bg-white shadow p-5 flex flex-col gap-2"
          >
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className="text-3xl font-semibold text-gray-900">{c.value}</div>
          </div>
        ))}
      </section>

      {/* Error / Loading */}
      {loading && (
        <div className="text-sm text-gray-500">Loading stats…</div>
      )}
      {err && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {err}
        </div>
      )}

      {/* Recent Activity */}
      <section className="bg-white rounded-xl shadow">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <div className="text-xs text-gray-500">
            {stats?.generated_at ? `Updated ${fmtDT(stats.generated_at)}` : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-5 py-2">ID</th>
                <th className="px-5 py-2">Company</th>
                <th className="px-5 py-2">Role</th>
                <th className="px-5 py-2">Status</th>
                <th className="px-5 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {(recent.length ? recent : []).map((row, i) => (
                <tr key={row.id || i} className="border-t border-gray-200">
                  <td className="px-5 py-2">{row.id || "—"}</td>
                  <td className="px-5 py-2">{row.company || row.company_name || "—"}</td>
                  <td className="px-5 py-2">{row.role || row.designation || "—"}</td>
                  <td className="px-5 py-2">
                    {row.status ? <Badge>{row.status}</Badge> : "—"}
                  </td>
                  <td className="px-5 py-2">{fmtDT(row.created_at)}</td>
                </tr>
              ))}
              {!loading && !err && recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-gray-500">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top Companies (optional) */}
      {(stats?.top_companies || []).length > 0 && (
        <section className="bg-white rounded-xl shadow">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Top Companies</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-left">
                <tr>
                  <th className="px-5 py-2">Company</th>
                  <th className="px-5 py-2">Locations</th>
                  <th className="px-5 py-2">Type</th>
                  <th className="px-5 py-2">QScore</th>
                  <th className="px-5 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_companies.map((c, i) => (
                  <tr key={c.id || c.name || i} className="border-top border-gray-200">
                    <td className="px-5 py-2">{c.name || "—"}</td>
                    <td className="px-5 py-2">
                      {Array.isArray(c.locations) && c.locations.length
                        ? c.locations.join(", ")
                        : c.location || "—"}
                    </td>
                    <td className="px-5 py-2">{c.type || "—"}</td>
                    <td className="px-5 py-2">{num(c.qscore)}</td>
                    <td className="px-5 py-2">{fmtDT(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

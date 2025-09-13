// dashboard/src/pages/HRLeads.jsx
import { useEffect, useMemo, useState } from "react";

export default function HRLeads() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "" });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    if (filters.status) p.set("status", filters.status);
    p.set("sort", "created_at.desc");
    return p.toString();
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/hr-leads?${query}`)
      .then((r) => r.json())
      .then((j) => setRows(j?.data || []))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">HR Leads</h1>
        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Search name/company/email…"
            className="border rounded-lg px-3 py-2"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Status</option>
            <option>New</option>
            <option>Contacted</option>
            <option>Response rcvd</option>
            <option>Follow-up 1 stage</option>
            <option>F-Up 2 stage</option>
            <option>F-Up 3 stage</option>
            <option>F-up 4 stage</option>
            <option>converted</option>
            <option>declined</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Company</th>
              <th className="text-left px-4 py-2">Designation</th>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>No HR leads yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.name || "-"}</div>
                    <div className="text-xs text-gray-500">
                      {r.linkedin_url && (
                        <a className="underline" href={ensureHttp(r.linkedin_url)} target="_blank" rel="noreferrer">
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">{r.company_name || r.company?.name || "-"}</td>
                  <td className="px-4 py-2">{r.designation || "-"}</td>
                  <td className="px-4 py-2">
                    {r.email ? <a className="underline" href={`mailto:${r.email}`}>{r.email}</a> : "—"}
                  </td>
                  <td className="px-4 py-2">{r.lead_status || "New"}</td>
                  <td className="px-4 py-2">{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ensureHttp(u) {
  if (!u) return null;
  return u.startsWith("http") ? u : `https://${u}`;
}

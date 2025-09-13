// dashboard/src/pages/HRLeads.jsx
import { useEffect, useMemo, useState } from "react";

const EMAIL_STATUS_COLOR = {
  validated: "bg-green-100 text-green-800",
  guessed: "bg-yellow-100 text-yellow-800",
  patterned: "bg-blue-100 text-blue-800",
  bounced: "bg-red-100 text-red-800",
  unknown: "bg-gray-100 text-gray-800",
};

export default function HRLeads() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", status: "", email_status: "" });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    if (filters.status) p.set("status", filters.status);
    if (filters.email_status) p.set("email_status", filters.email_status);
    return p.toString();
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/hr-leads?${query}`)
      .then(r => r.json())
      .then(j => setRows(j?.data || []))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">HR Leads</h1>
          <p className="text-sm text-gray-600">People linked to companies (LinkedIn/email signals)</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Search name/designation…"
            className="border rounded-lg px-3 py-2"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            <option value="">Lead Status</option>
            <option>New</option>
            <option>Contacted</option>
            <option>Response Received</option>
            <option>Follow-up 1</option>
            <option>Follow-up 2</option>
            <option>Follow-up 3</option>
            <option>Follow-up 4</option>
            <option>Converted</option>
            <option>Declined</option>
          </select>
          <select
            className="border rounded-lg px-3 py-2"
            value={filters.email_status}
            onChange={(e) => setFilters(f => ({ ...f, email_status: e.target.value }))}
          >
            <option value="">Email Status</option>
            <option value="validated">validated</option>
            <option value="guessed">guessed</option>
            <option value="patterned">patterned</option>
            <option value="bounced">bounced</option>
            <option value="unknown">unknown</option>
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
              <th className="text-left px-4 py-2">Lead Status</th>
              <th className="text-left px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>No leads yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">{r.name || "-"}</div>
                  <div className="text-xs text-gray-500 flex gap-2">
                    {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="underline">LinkedIn</a>}
                    {r.location && <span>{r.location}</span>}
                  </div>
                </td>
                <td className="px-4 py-2">{r.company_id?.slice(0, 8)}…</td>
                <td className="px-4 py-2">{r.designation || "-"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span>{r.email || "-"}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${EMAIL_STATUS_COLOR[r.email_status || "unknown"] || EMAIL_STATUS_COLOR.unknown}`}>
                      {r.email_status || "unknown"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2">{r.lead_status}</td>
                <td className="px-4 py-2">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

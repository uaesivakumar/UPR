// dashboard/src/pages/CompaniesPage.jsx
import { useEffect, useMemo, useState } from "react";

export default function CompaniesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ search: "", type: "", status: "", location: "" });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("search", filters.search);
    if (filters.type) p.set("type", filters.type);
    if (filters.status) p.set("status", filters.status);
    if (filters.location) p.set("location", filters.location);
    p.set("sort", "created_at.desc");
    return p.toString();
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/companies?${query}`)
      .then(r => r.json())
      .then(j => setRows(j?.data || []))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Targeted Companies</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Search company…"
            className="border rounded-lg px-3 py-2"
            value={filters.search}
            onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
          />
          <select
            className="border rounded-lg px-3 py-2"
            value={filters.type}
            onChange={(e) => setFilters(f => ({ ...f, type: e.target.value }))}
          >
            <option value="">Type</option>
            <option value="ALE">ALE</option>
            <option value="NON_ALE">NON_ALE</option>
            <option value="Good Coded">Good Coded</option>
          </select>
          <select
            className="border rounded-lg px-3 py-2"
            value={filters.status}
            onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
          >
            <option value="">Status</option>
            <option>New</option>
            <option>Contacted</option>
            <option>Response Received</option>
            <option>Converted</option>
            <option>Declined</option>
          </select>
          <select
            className="border rounded-lg px-3 py-2"
            value={filters.location}
            onChange={(e) => setFilters(f => ({ ...f, location: e.target.value }))}
          >
            <option value="">Location</option>
            <option>Abu Dhabi</option>
            <option>Dubai</option>
            <option>Sharjah</option>
          </select>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="text-left px-4 py-2">Company</th>
              <th className="text-left px-4 py-2">Locations</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">QScore</th>
              <th className="text-left px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={6}>No companies yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-gray-500 flex gap-2">
                    {r.website_url && <a href={r.website_url} target="_blank" rel="noreferrer" className="underline">website</a>}
                    {r.linkedin_url && <a href={r.linkedin_url} target="_blank" rel="noreferrer" className="underline">linkedin</a>}
                  </div>
                </td>
                <td className="px-4 py-2">{Array.isArray(r.locations) ? r.locations.join(", ") : ""}</td>
                <td className="px-4 py-2">{r.type || "-"}</td>
                <td className="px-4 py-2">{r.status}</td>
                <td className="px-4 py-2">{r.qscore ?? 0}</td>
                <td className="px-4 py-2">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

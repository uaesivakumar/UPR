// dashboard/src/pages/LeadsPage.jsx
import { useEffect, useState } from "react";
import { fetchLeads } from "../utils/auth";

export default function LeadsPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const json = await fetchLeads();
        setRows(json.data || []);
      } catch (e) {
        setErr("Failed to load leads");
      }
    })();
  }, []);

  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Leads</h1>
      {err && <div className="text-red-600 mb-3">{err}</div>}
      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-4 py-2 text-left">ID</th>
              <th className="px-4 py-2 text-left">Company</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Salary Band</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2">{r.id}</td>
                <td className="px-4 py-2">{r.company}</td>
                <td className="px-4 py-2">{r.role}</td>
                <td className="px-4 py-2">{r.salary_band}</td>
                <td className="px-4 py-2">{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-gray-500" colSpan={5}>
                  No leads yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

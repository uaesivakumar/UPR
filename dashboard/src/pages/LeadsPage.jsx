// dashboard/src/pages/LeadsPage.jsx
import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import { fetchLeads, getToken, createLead } from "../utils/auth";

export default function LeadsPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company: "",
    role: "",
    salary_band: "AED 50K+",
    status: "New",
  });

  useEffect(() => {
    (async () => {
      try {
        const json = await fetchLeads();
        setRows(json.data || []);
      } catch (e) {
        const msg = getToken() ? "Failed to load leads" : "Unauthorized — login again";
        setErr(msg);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!q) return rows;
    const s = q.toLowerCase();
    return rows.filter(
      (r) =>
        r.company?.toLowerCase().includes(s) ||
        r.role?.toLowerCase().includes(s) ||
        r.status?.toLowerCase().includes(s) ||
        r.id?.toLowerCase().includes(s)
    );
  }, [rows, q]);

  function openModal() {
    setForm({ company: "", role: "", salary_band: "AED 50K+", status: "New" });
    setShowModal(true);
  }

  async function submitNew(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const res = await createLead(form); // persist to backend
      const newLead = res.data;
      setRows((r) => [newLead, ...r]);
      setShowModal(false);
    } catch (e) {
      setErr("Failed to create lead. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Topbar title="Leads" onSearch={setQ} onAdd={openModal} />

      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left font-medium">ID</th>
              <th className="px-4 py-3 text-left font-medium">Company</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Salary Band</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t last:border-b">
                <td className="px-4 py-3 text-gray-700">{r.id}</td>
                <td className="px-4 py-3">{r.company}</td>
                <td className="px-4 py-3">{r.role}</td>
                <td className="px-4 py-3">{r.salary_band}</td>
                <td className="px-4 py-3">
                  <span className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-700">
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-gray-500" colSpan={5}>
                  No leads yet. Click <span className="font-medium">Add Lead</span> to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Lead Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Add Lead</h3>
              <p className="text-sm text-gray-500">Creates a new lead in your backend.</p>
            </div>
            <form onSubmit={submitNew} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Company</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Role</label>
                  <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Salary Band</label>
                <input
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.salary_band}
                    onChange={(e) => setForm({ ...form, salary_band: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">Status</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-gray-900"
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option>New</option>
                    <option>Qualified</option>
                    <option>Contacted</option>
                    <option>Enriched</option>
                  </select>
                </div>
              </div>

              <div className="mt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// dashboard/src/pages/LeadsPage.jsx
import { useEffect, useMemo, useState } from "react";
import Topbar from "../components/Topbar";
import { fetchLeads, getToken, createLead, updateLead, deleteLead } from "../utils/auth";

const PAGE_SIZE = 10;

export default function LeadsPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState("created_at:desc");

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    company: "",
    role: "",
    salary_band: "AED 50K+",
    status: "New",
  });

  // fetch function
  async function load({ keepPage = false } = {}) {
    try {
      const currentPage = keepPage ? page : 1;
      const res = await fetchLeads({ q, page: currentPage, page_size: PAGE_SIZE, sort });
      setRows(res.data);
      setTotal(res.total);
      setPage(res.page);
    } catch {
      const msg = getToken() ? "Failed to load leads" : "Unauthorized — login again";
      setErr(msg);
    }
  }

  // initial
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // search (debounced)
  useEffect(() => {
    const t = setTimeout(() => load(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sort]);

  // page change
  useEffect(() => {
    load({ keepPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showingFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingTo = Math.min(total, page * PAGE_SIZE);

  function openAdd() {
    setIsEditing(false);
    setEditId(null);
    setForm({ company: "", role: "", salary_band: "AED 50K+", status: "New" });
    setShowModal(true);
  }

  function openEdit(row) {
    setIsEditing(true);
    setEditId(row.id);
    setForm({
      company: row.company || "",
      role: row.role || "",
      salary_band: row.salary_band || "AED 50K+",
      status: row.status || "New",
    });
    setShowModal(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      if (isEditing && editId != null) {
        await updateLead(Number(editId), form);
      } else {
        await createLead(form);
      }
      setShowModal(false);
      // reload first page to show new/updated order
      setPage(1);
      await load();
    } catch {
      setErr(isEditing ? "Failed to update lead" : "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(row) {
    const ok = window.confirm(`Delete lead #${row.id} (${row.company})?`);
    if (!ok) return;
    try {
      await deleteLead(Number(row.id));
      // If we deleted the last item on the last page, bump back a page
      const willBeEmpty = rows.length === 1 && page > 1;
      if (willBeEmpty) setPage(page - 1);
      await load({ keepPage: true });
    } catch {
      setErr("Failed to delete lead");
    }
  }

  function toggleSort(col) {
    const [curCol, curDir] = sort.split(":");
    if (curCol === col) {
      setSort(`${col}:${curDir === "asc" ? "desc" : "asc"}`);
    } else {
      setSort(`${col}:asc`);
    }
  }

  const th = (key, label) => (
    <th
      className="px-4 py-3 text-left font-medium cursor-pointer select-none"
      onClick={() => toggleSort(key)}
      title="Sort"
    >
      {label}
      {sort.startsWith(key + ":") && (
        <span className="ml-1 text-gray-400">{sort.endsWith(":asc") ? "↑" : "↓"}</span>
      )}
    </th>
  );

  return (
    <div>
      <Topbar title="Leads" onSearch={setQ} onAdd={openAdd} />

      {err && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {th("id", "ID")}
              {th("company", "Company")}
              {th("role", "Role")}
              {th("salary_band", "Salary Band")}
              {th("status", "Status")}
              <th className="px-4 py-3 text-left font-medium w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
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
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(r)}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(r)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-10 text-center text-gray-500" colSpan={6}>
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
        <div>
          Showing <span className="font-medium">{showingFrom}</span>–
          <span className="font-medium">{showingTo}</span> of{" "}
          <span className="font-medium">{total}</span>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <button
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
          >
            Next
          </button>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{isEditing ? "Edit Lead" : "Add Lead"}</h3>
              <p className="text-sm text-gray-500">
                {isEditing ? "Update this lead’s details." : "Creates a new lead in your backend."}
              </p>
            </div>
            <form onSubmit={submitForm} className="space-y-3">
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
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

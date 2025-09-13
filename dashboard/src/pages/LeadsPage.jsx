// dashboard/src/pages/LeadsPage.jsx
import { useEffect, useState } from "react";
import { authFetch, getAuthHeader } from "../utils/auth";

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchLeads() {
    setLoading(true);
    setErr(null);
    try {
      const res = await authFetch("/api/leads", {
        headers: getAuthHeader(),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to fetch leads");
      }
      const data = await res.json();
      setLeads(data.data || []);
    } catch (e) {
      setErr(e?.message || "Error fetching leads");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLeads();
  }, []);

  async function addLead(e) {
    e.preventDefault();
    if (!company.trim() || !role.trim()) {
      alert("Company and role are required");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          company: company.trim(),
          role: role.trim(),
          salary_band: "AED 50K+",
          status: "New",
        }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        throw new Error(data?.error || "Failed to add lead");
      }
      const data = await res.json();
      setLeads((prev) => [data.data, ...prev]);
      setCompany("");
      setRole("");
    } catch (e) {
      alert(e?.message || "Failed to add lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500">
          Manage discovered companies and decision makers.
        </p>
      </div>

      <form
        onSubmit={addLead}
        className="bg-white rounded-xl shadow p-4 flex flex-col md:flex-row gap-3"
      >
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          className="flex-1 rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role"
          className="flex-1 rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-gray-900 text-white px-4 py-2 font-medium hover:bg-gray-800 disabled:opacity-60"
        >
          {saving ? "Adding…" : "Add Lead"}
        </button>
      </form>

      {loading ? (
        <div className="text-gray-500">Loading leads…</div>
      ) : err ? (
        <div className="text-red-600">{err}</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 text-gray-700 text-left">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Salary Band</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-gray-200">
                  <td className="px-4 py-2">{lead.company}</td>
                  <td className="px-4 py-2">{lead.role}</td>
                  <td className="px-4 py-2">{lead.salary_band}</td>
                  <td className="px-4 py-2">{lead.status}</td>
                  <td className="px-4 py-2">
                    {new Date(lead.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

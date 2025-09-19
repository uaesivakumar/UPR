// dashboard/src/pages/CompaniesPage.jsx
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../utils/auth";

const TYPE_OPTIONS = ["ALE", "NON_ALE", "Good Coded"];
const STATUS_OPTIONS = ["New", "Contacted", "Response Received", "Converted", "Declined"];
const LOCATION_OPTIONS = ["Abu Dhabi", "Dubai", "Sharjah"];

export default function CompaniesPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [location, setLocation] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [showAddCompany, setShowAddCompany] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set("search", query.trim());
    if (type) p.set("type", type);
    if (status) p.set("status", status);
    if (location) p.set("location", location);
    p.set("sort", "created_at.desc");
    return p.toString();
  }, [query, type, status, location]);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await authFetch(`/api/companies?${qs}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      console.error(e);
      setErr(e.message || "Failed to load companies");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [qs]); // eslint-disable-line

  const handlePick = (company) => {
    if (!company) return;
    window.dispatchEvent(
      new CustomEvent("upr:companySidebar", {
        detail: {
          id: company.id,
          name: company.name,
          domain: company.domain,
          website_url: company.website_url,
        },
      })
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            Targeted Companies
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Search and filter companies you’re tracking.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl bg-gray-900 text-white px-4 py-2"
            onClick={() => setShowAddCompany(true)}
          >
            + Add Company
          </button>
          <button
            className="rounded-xl border px-4 py-2"
            onClick={() => setShowAddLead(true)}
          >
            + Add HR Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company…"
          className="w-80 max-w-[90vw] px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        />

        <Select value={type} onChange={setType} placeholder="Type" options={TYPE_OPTIONS} />
        <Select value={status} onChange={setStatus} placeholder="Status" options={STATUS_OPTIONS} />
        <Select value={location} onChange={setLocation} placeholder="Location" options={LOCATION_OPTIONS} />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <Th>Company</Th>
              <Th>Locations</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>QScore</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : err ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-red-600">
                  {err}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  No companies yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => <CompanyRow key={r.id} r={r} onPick={handlePick} />)
            )}
          </tbody>
        </table>
      </div>

      {showAddCompany && (
        <AddCompanyModal
          onClose={() => setShowAddCompany(false)}
          onSaved={() => { setShowAddCompany(false); load(); }}
        />
      )}

      {showAddLead && (
        <AddLeadModal
          companies={rows}
          onClose={() => setShowAddLead(false)}
          onSaved={() => { setShowAddLead(false); /* optional refresh leads page */ }}
        />
      )}
    </div>
  );
}

function CompanyRow({ r, onPick }) {
  const createdRaw = r.created ?? r.created_at;
  const created =
    createdRaw && !Number.isNaN(new Date(createdRaw).getTime())
      ? new Date(createdRaw).toLocaleDateString()
      : "—";

  const onActivate = () => onPick && onPick(r);
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate();
    }
  };

  return (
    <tr
      className="hover:bg-gray-50/60 cursor-pointer"
      onClick={onActivate}
      onKeyDown={onKeyDown}
      role="button"
      tabIndex={0}
      title="Click to use this company in Enrichment"
    >
      <Td>
        <div className="flex flex-col">
          <div className="font-medium text-gray-900">{r.name || "—"}</div>
          <div className="text-xs text-gray-500 mt-1 flex gap-4">
            {r.website_url ? (
              <a href={r.website_url} className="underline underline-offset-2 hover:text-gray-700" target="_blank" rel="noreferrer">
                website
              </a>
            ) : (
              <span className="text-gray-400">website</span>
            )}
            {r.linkedin_url ? (
              <a href={r.linkedin_url} className="underline underline-offset-2 hover:text-gray-700" target="_blank" rel="noreferrer">
                linkedin
              </a>
            ) : (
              <span className="text-gray-400">linkedin</span>
            )}
          </div>
        </div>
      </Td>
      <Td>{Array.isArray(r.locations) && r.locations.length ? r.locations.join(", ") : "—"}</Td>
      <Td>{r.type || "—"}</Td>
      <Td><Badge>{r.status || "New"}</Badge></Td>
      <Td>{typeof r.qscore === "number" ? r.qscore : 0}</Td>
      <Td className="text-gray-500">{created}</Td>
    </tr>
  );
}

/* ---------- Modals ---------- */

function AddCompanyModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("New");
  const [locations, setLocations] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr("");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        website_url: website.trim() || null,
        linkedin_url: linkedin.trim() || null,
        type: type || null,
        status: status || "New",
        locations: locations
          ? locations.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
      };
      const res = await authFetch("/api/manual/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Save failed");
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Company" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Name" value={name} onChange={setName} placeholder="Company name" />
        <Input label="Website" value={website} onChange={setWebsite} placeholder="https://example.com" />
        <Input label="LinkedIn" value={linkedin} onChange={setLinkedin} placeholder="https://www.linkedin.com/company/..." />
        <Row>
          <Select value={type} onChange={setType} placeholder="Type" options={TYPE_OPTIONS} />
          <Select value={status} onChange={setStatus} placeholder="Status" options={STATUS_OPTIONS} />
        </Row>
        <Input label="Locations (comma-separated)" value={locations} onChange={setLocations} placeholder="Abu Dhabi, Dubai" />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="px-4 py-2 rounded border" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-gray-900 text-white disabled:opacity-50" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddLeadModal({ companies, onClose, onSaved }) {
  const [companyId, setCompanyId] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr("");
    setSaving(true);
    try {
      const payload = {
        company_id: companyId || null,
        name: name.trim(),
        designation: title.trim() || null,
        email: email.trim() || null,
        linkedin_url: linkedin.trim() || null,
      };
      const res = await authFetch("/api/manual/hr-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Save failed");
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add HR Lead" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-sm block mb-1">Company</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">— Select a company —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <Input label="Name" value={name} onChange={setName} placeholder="Full name" />
        <Input label="Title" value={title} onChange={setTitle} placeholder="HR Manager" />
        <Input label="Email" value={email} onChange={setEmail} placeholder="name@company.com" />
        <Input label="LinkedIn" value={linkedin} onChange={setLinkedin} placeholder="https://www.linkedin.com/in/..." />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="px-4 py-2 rounded border" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 rounded bg-gray-900 text-white disabled:opacity-50" onClick={save} disabled={saving || !name.trim() || !companyId}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- small UI helpers ---------- */

function Th({ children }) {
  return (
    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}
function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
function Badge({ children }) {
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">{children}</span>;
}
function Select({ value, onChange, placeholder, options }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className="appearance-none px-3 py-2 pr-8 rounded-xl border border-gray-300 bg-gray-100 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10">
        <option value="">{placeholder}</option>
        {options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500">▼</div>
    </div>
  );
}
function Input({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-sm block mb-1">{label}</label>
      <input className="w-full rounded border px-3 py-2" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Row({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}
function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="text-lg font-semibold">{title}</div>
          <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

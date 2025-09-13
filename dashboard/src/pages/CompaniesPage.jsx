// dashboard/src/pages/CompaniesPage.jsx
import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../utils/auth";

// Keep these in sync with backend validators (utils/validators.js)
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

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (query.trim()) p.set("search", query.trim());
    if (type) p.set("type", type);
    if (status) p.set("status", status);
    if (location) p.set("location", location);
    p.set("sort", "created_at.desc");
    return p.toString();
  }, [query, type, status, location]);

  useEffect(() => {
    let abort = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const res = await authFetch(`/api/companies?${qs}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || "Request failed");
        if (!abort) setRows(Array.isArray(json.data) ? json.data : []);
      } catch (e) {
        if (!abort) {
          console.error(e);
          setErr(e.message || "Failed to load companies");
          setRows([]);
        }
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [qs]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Targeted Companies
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Search and filter companies you’re tracking.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search company…"
          className="w-80 max-w-[90vw] px-3 py-2 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        />

        <Select
          value={type}
          onChange={setType}
          placeholder="Type"
          options={TYPE_OPTIONS}
        />
        <Select
          value={status}
          onChange={setStatus}
          placeholder="Status"
          options={STATUS_OPTIONS}
        />
        <Select
          value={location}
          onChange={setLocation}
          placeholder="Location"
          options={LOCATION_OPTIONS}
        />
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
              rows.map((r) => <CompanyRow key={r.id} r={r} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CompanyRow({ r }) {
  const createdRaw = r.created ?? r.created_at; // tolerate either key
  const created =
    createdRaw && !Number.isNaN(new Date(createdRaw).getTime())
      ? new Date(createdRaw).toLocaleDateString()
      : "—";

  return (
    <tr className="hover:bg-gray-50/60">
      <Td>
        <div className="flex flex-col">
          <div className="font-medium text-gray-900">{r.name || "—"}</div>
          <div className="text-xs text-gray-500 mt-1 flex gap-4">
            {r.website_url ? (
              <a
                href={r.website_url}
                className="underline underline-offset-2 hover:text-gray-700"
                target="_blank"
                rel="noreferrer"
              >
                website
              </a>
            ) : (
              <span className="text-gray-400">website</span>
            )}
            {r.linkedin_url ? (
              <a
                href={r.linkedin_url}
                className="underline underline-offset-2 hover:text-gray-700"
                target="_blank"
                rel="noreferrer"
              >
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
      <Td>
        <Badge>{r.status || "New"}</Badge>
      </Td>
      <Td>{typeof r.qscore === "number" ? r.qscore : 0}</Td>
      <Td className="text-gray-500">{created}</Td>
    </tr>
  );
}

/* ---------- small UI helpers ---------- */

function Th({ children }) {
  return (
    <th
      scope="col"
      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
      {children}
    </span>
  );
}

function Select({ value, onChange, placeholder, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none px-3 py-2 pr-8 rounded-xl border border-gray-300 bg-gray-100 text-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500">
        ▼
      </div>
    </div>
  );
}

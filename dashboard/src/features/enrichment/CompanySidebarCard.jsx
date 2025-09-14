import React from "react";

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 w-20 shrink-0">{label}</div>
      <div className="text-sm break-words">{value ?? "—"}</div>
    </div>
  );
}

function linkOrText(url) {
  if (!url) return "—";
  const safe = String(url).startsWith("http") ? url : `https://${url}`;
  return (
    <a className="underline" href={safe} target="_blank" rel="noreferrer">
      {url}
    </a>
  );
}

/** Compact company card shown inside the left Sidebar (under the menu). */
export default function CompanySidebarCard({ company }) {
  if (!company) return null;
  return (
    <div className="mt-4 bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
      <div className="text-sm font-semibold text-gray-900 mb-1">Company</div>
      <div className="text-sm text-gray-700">
        <Row label="Name" value={company.name || "—"} />
        <Row label="Website" value={linkOrText(company.website)} />
        <Row label="LinkedIn" value={linkOrText(company.linkedin)} />
        <Row label="HQ" value={company.hq || "—"} />
        {company.industry && <Row label="Industry" value={company.industry} />}
        {company.size && <Row label="Size" value={company.size} />}
        {Array.isArray(company.locations) && company.locations.length > 0 && (
          <Row label="Locations" value={company.locations.join(", ")} />
        )}
      </div>
    </div>
  );
}

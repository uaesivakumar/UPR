import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import EnrichmentView from "../features/enrichment/EnrichmentView";

/** Thin wrapper page; company card is shown inside Sidebar via a custom event. */
export default function EnrichmentPage() {
  const [sp] = useSearchParams();
  const initialQuery = sp.get("q") || "";

  useEffect(() => {
    // Clear sidebar company card when leaving this page
    return () => {
      window.dispatchEvent(new CustomEvent("upr:companySidebar", { detail: null }));
    };
  }, []);

  return <EnrichmentView initialQuery={initialQuery} onCompanyChange={() => { /* handled via event */ }} />;
}

import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getToken, logout as clientLogout } from "../utils/auth";

export default function Topbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");

  async function onLogout() {
    try {
      const token = getToken();
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {}
    clientLogout(); // clears token + redirects to /login
  }

  function onAddLead() {
    if (location.pathname !== "/leads") {
      navigate("/leads#add");
    } else {
      window.dispatchEvent(new CustomEvent("focus-add-lead"));
    }
  }

  function onSearch(e) {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    navigate(`/enrichment?q=${encodeURIComponent(query)}`);
    setQ("");
  }

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="h-full px-4 md:px-6 flex items-center gap-3">
        <form onSubmit={onSearch} className="flex-1 max-w-xl">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search companies, LinkedIn URLs, or roles…"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
          />
        </form>
        <div className="flex items-center gap-2">
          <button
            onClick={onAddLead}
            className="rounded-xl bg-gray-900 text-white px-3 py-2 text-sm font-medium hover:bg-gray-800"
          >
            + Add Lead
          </button>
          <button
            onClick={onLogout}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            aria-label="Log out"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}

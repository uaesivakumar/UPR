import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const [state, setState] = useState({ checking: true, ok: false });

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/verify", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const ok = r.ok && (await r.json().catch(() => ({})))?.ok;
        if (!gone) setState({ checking: false, ok: !!ok });
      } catch {
        if (!gone) setState({ checking: false, ok: false });
      }
    })();
    return () => { gone = true; };
  }, []);

  if (state.checking) return <div className="p-6 text-gray-500">Checking session…</div>;
  if (!state.ok) return <Navigate to="/login" replace />;
  return children;
}

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();

  // UI state
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // If you ever host the API elsewhere, set VITE_API_BASE; otherwise '' keeps same-origin.
  const API_BASE = (import.meta?.env?.VITE_API_BASE || "").replace(/\/+$/, "");

  // 1) Probe existing session; DO NOT hang the UI on network errors.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const j = await res.json().catch(() => ({}));
          if (!cancelled && j?.ok) {
            navigate("/", { replace: true });
            return;
          }
        }
        // Non-OK falls through to show the form
      } catch (e) {
        // Network error (what you’re seeing) — just show the form
        console.warn("verify failed:", e);
        window.__UPR_LAST_UI_ERROR__ = e;
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE, navigate]);

  // 2) Submit credentials
  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        // Try to extract helpful text
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Login failed (HTTP ${res.status})`);
      }
      const j = await res.json().catch(() => ({}));
      if (j?.ok) {
        navigate("/", { replace: true });
        return;
      }
      throw new Error(j?.error || "Login failed");
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Checking session…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white border rounded-xl p-6 shadow-sm"
      >
        <h1 className="text-lg font-semibold mb-4">Sign in</h1>

        {error ? (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            {error}
          </div>
        ) : null}

        <label className="block text-sm mb-1" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="w-full mb-3 border rounded px-3 py-2"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        <label className="block text-sm mb-1" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="w-full mb-4 border rounded px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <button className="w-full rounded bg-gray-900 text-white py-2">
          Sign in
        </button>

        <p className="text-xs text-gray-500 mt-3">
          If session check fails due to network, the form appears so you can sign in manually.
        </p>
      </form>
    </div>
  );
}

// dashboard/src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginWithPassword, verifyToken } from "../utils/auth";

export default function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If already logged in, bounce to /
    (async () => {
      const ok = await verifyToken();
      if (ok) nav("/");
    })();
  }, [nav]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await loginWithPassword(username.trim(), password);
      nav("/");
    } catch (e) {
      setErr(e?.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-3xl font-semibold text-center text-gray-900">UPR Admin Login</h1>
        <p className="mt-2 text-center text-gray-500">Sign in with your username and password.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gray-900 text-white py-2 font-medium hover:bg-gray-800 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Login"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Your session is stored locally in this browser.
          </p>
        </form>
      </div>
    </div>
  );
}

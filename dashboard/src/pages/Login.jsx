// dashboard/src/pages/Login.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginWithPassword, verifyToken } from "../utils/auth";

export default function Login() {
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  // On mount, if token already valid, go straight in
  useEffect(() => {
    (async () => {
      const ok = await verifyToken();
      if (ok) nav("/");
      else setChecking(false);
    })();
  }, [nav]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    const { ok, error } = await loginWithPassword(username.trim(), password);
    if (ok) nav("/");
    else setErr(error || "Login failed");
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        Checking session…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-semibold text-gray-900 text-center">UPR Admin Login</h1>
        <p className="text-sm text-gray-500 text-center mt-1">
          Sign in with your username and password.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
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
              required
            />
          </div>

          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-gray-900 text-white px-4 py-2 font-medium hover:bg-gray-800"
          >
            Login
          </button>
        </form>

        <p className="mt-3 text-center text-[11px] text-gray-400">
          Your session is stored only in this browser.
        </p>
      </div>
    </div>
  );
}

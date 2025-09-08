import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, logout } from "../utils/auth";

export default function Login() {
  const [username, setUser] = useState("");
  const [password, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const ok = await login(username.trim(), password);
    setLoading(false);
    if (!ok) {
      setErr("Invalid username or password");
      return;
    }
    navigate("/", { replace: true });
  }

  function onClear() {
    setUser("");
    setPass("");
    setErr(null);
    logout();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold mb-1">Admin Login</h1>
        <p className="text-sm text-gray-500 mb-6">Use your credentials to continue.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              value={username}
              onChange={(e) => setUser(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="admin"
              autoFocus
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPass(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900"
              placeholder="••••••••"
              required
            />
          </div>

          {err && <div className="text-sm text-red-600">{err}</div>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-gray-900 text-white py-2.5 hover:bg-gray-800 disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Login"}
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl border border-gray-300 py-2.5 px-4 hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
        </form>

        <p className="mt-6 text-xs text-gray-500">
          Demo creds: <code>admin</code> / <code>supersecret</code>
        </p>
      </div>
    </div>
  );
}

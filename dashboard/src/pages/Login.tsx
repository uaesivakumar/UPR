// dashboard/src/pages/Login.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { setToken, validateToken, clearToken } from "../utils/auth";

export default function Login() {
  const [token, setTokenInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const ok = await validateToken(token.trim());
      if (!ok) {
        setErr("Invalid Admin Token");
        setLoading(false);
        return;
      }
      setToken(token.trim());
      navigate("/", { replace: true });
    } catch (e) {
      setErr("Unable to validate token");
      setLoading(false);
    }
  }

  function onLogout() {
    clearToken();
    setTokenInput("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow">
        <h1 className="text-2xl font-semibold mb-2">UPR Admin Login</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your Admin Token to access the dashboard.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="••••••••••"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
              required
            />
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gray-900 text-white py-2.5 hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? "Validating..." : "Login"}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-gray-300 py-2.5 hover:bg-gray-100"
          >
            Clear
          </button>
        </form>
      </div>
    </div>
  );
}

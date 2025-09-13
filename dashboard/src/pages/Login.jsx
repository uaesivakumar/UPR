// dashboard/src/pages/Login.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getToken, setToken, verifyToken, loginWithToken } from "../utils/auth";

export default function Login() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const nextPath = useMemo(() => search.get("next") || "/", [search]);

  const [mode, setMode] = useState("token");

  const [adminToken, setAdminToken] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenErr, setTokenErr] = useState(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwErr, setPwErr] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    (async () => {
      const existing = getToken();
      if (existing && (await verifyToken(existing))) {
        navigate(nextPath);
      }
    })();
  }, [navigate, nextPath]);

  const handleTokenLogin = async (e) => {
    e.preventDefault();
    setTokenErr(null);
    setTokenLoading(true);
    const res = await loginWithToken(adminToken.trim());
    setTokenLoading(false);
    if (!res.success) {
      setTokenErr(res.message || "Invalid token");
      return;
    }
    navigate(nextPath);
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setPwErr(null);
    setPwLoading(true);
    try {
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!resp.ok) {
        const data = await safeJson(resp);
        setPwErr(data?.error || "Invalid credentials");
        setPwLoading(false);
        return;
      }
      const data = await resp.json();
      if (!data?.ok || !data?.token) {
        setPwErr("Login failed");
        setPwLoading(false);
        return;
      }
      setToken(String(data.token));
      setPwLoading(false);
      navigate(nextPath);
    } catch (err) {
      setPwErr("Network error");
      setPwLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl shadow-lg bg-white p-6 md:p-8">
        <h1 className="text-2xl font-semibold text-gray-900">UPR Admin Login</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sign in using an Admin Token or username/password.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
          <button
            className={`py-2 rounded-lg text-sm font-medium ${
              mode === "token" ? "bg-white shadow" : "text-gray-600"
            }`}
            onClick={() => setMode("token")}
          >
            Admin Token
          </button>
          <button
            className={`py-2 rounded-lg text-sm font-medium ${
              mode === "password" ? "bg-white shadow" : "text-gray-600"
            }`}
            onClick={() => setMode("password")}
          >
            Username / Password
          </button>
        </div>

        {mode === "token" && (
          <form onSubmit={handleTokenLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Admin Token
              </label>
              <input
                type="password"
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Paste the Admin Token"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
                required
                autoFocus
              />
            </div>

            {tokenErr && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {tokenErr}
              </div>
            )}

            <button
              type="submit"
              disabled={tokenLoading}
              className="w-full rounded-xl bg-gray-900 text-white py-2.5 font-medium hover:bg-gray-800 disabled:opacity-60"
            >
              {tokenLoading ? "Verifying…" : "Login"}
            </button>

            <p className="text-xs text-gray-400">
              The token is stored locally in this browser only.
            </p>
          </form>
        )}

        {mode === "password" && (
          <form onSubmit={handlePasswordLogin} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-gray-800"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {pwErr && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                {pwErr}
              </div>
            )}

            <button
              type="submit"
              disabled={pwLoading}
              className="w-full rounded-xl bg-gray-900 text-white py-2.5 font-medium hover:bg-gray-800 disabled:opacity-60"
            >
              {pwLoading ? "Signing in…" : "Login"}
            </button>

            <p className="text-xs text-gray-400">
              Username/password creates a server session; a session token is stored locally to authorize API calls.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

async function safeJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

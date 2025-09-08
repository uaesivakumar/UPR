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
    } catch {
      setErr("Unable to validate token");
      setLoading(false);
    }
  }

  function onClear() {
    clearToken();
    setTokenInput("");
    setErr(null);
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-gray-900 via-gray-900 to-black text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6">
        {/* Left brand panel (hidden on small screens) */}
        <div className="hidden w-1/2 pr-8 md:block">
          <div className="space-y-6">
            <div className="inline-flex items-center rounded-2xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
              <span className="text-sm text-gray-300">UAE Premium Radar</span>
            </div>
            <h1 className="text-5xl font-semibold leading-tight">
              Welcome back,
              <br />
              <span className="text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text">
                Admin
              </span>
            </h1>
            <p className="max-w-md text-gray-400">
              Access your dashboard to discover premium employers, enrich profiles,
              and generate tailored outreach — all in one place.
            </p>

            <div className="grid grid-cols-3 gap-4 pt-4">
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-2xl font-semibold">Secured</div>
                <div className="mt-1 text-xs text-gray-400">Token-gated access</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-2xl font-semibold">Fast</div>
                <div className="mt-1 text-xs text-gray-400">Optimized UI</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                <div className="text-2xl font-semibold">Focused</div>
                <div className="mt-1 text-xs text-gray-400">Admin-only tools</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right auth card */}
        <div className="w-full md:w-1/2">
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-3xl bg-white/10 p-8 backdrop-blur-xl ring-1 ring-white/15 shadow-2xl">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold">UPR Admin Login</h2>
                <p className="mt-1 text-sm text-gray-300">
                  Enter your Admin Token to access the dashboard.
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-gray-300">
                    Admin Token
                  </label>
                  <input
                    type="password"
                    inputMode="text"
                    value={token}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="••••••••••"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-500 outline-none ring-0 focus:border-emerald-400 focus:bg-white/10"
                    required
                    autoFocus
                  />
                </div>

                {err && (
                  <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {err}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 font-medium text-black hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {loading ? "Validating…" : "Login"}
                  </button>
                  <button
                    type="button"
                    onClick={onClear}
                    className="rounded-xl border border-white/15 px-4 py-3 text-white hover:bg-white/5"
                  >
                    Clear
                  </button>
                </div>
              </form>

              <div className="mt-6 text-xs text-gray-400">
                Tip: Set your ADMIN_TOKEN in Render to enable access.  
                (Your <code>__diag</code> shows <code>admin_token_set: false</code>.)
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-gray-500">
              © {new Date().getFullYear()} UPR • Admin Console
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// dashboard/src/utils/auth.ts
const TOKEN_KEY = "upr_admin_jwt";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string): void {
  try { localStorage.setItem(TOKEN_KEY, t); } catch {}
}
export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function getAuthHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * authFetch with optional noRedirect mode (so /login doesn't loop).
 * If opts.noRedirect === true, a 401 is returned to the caller without redirecting.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts?: { noRedirect?: boolean }
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const auth = getAuthHeader();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);

  const res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    // Don't hard-redirect if caller asked not to (used by Login page).
    if (opts?.noRedirect) return res;
    try { clearToken(); } finally { if (typeof window !== "undefined") window.location.href = "/login"; }
    throw new Error("Unauthorized");
  }
  return res;
}

/** Username/password login -> {ok, token} */
export async function loginWithPassword(username: string, password: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await safeJson(res);
  if (!res.ok || !data?.ok || !data?.token) {
    return { ok: false, error: data?.error || "Login failed" };
  }
  setToken(data.token);
  return { ok: true, token: data.token };
}

/** Verify the stored JWT without redirecting on 401. */
export async function verifyToken(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const res = await authFetch("/api/auth/verify", {}, { noRedirect: true });
  if (res.ok) return true;
  clearToken();
  return false;
}

export function logout(): void {
  try { clearToken(); } finally { if (typeof window !== "undefined") window.location.href = "/login"; }
}

async function safeJson(resp: Response) {
  try { return await resp.json(); } catch { return null; }
}

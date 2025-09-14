// dashboard/src/utils/auth.ts

// Storage keys
const KEY = "upr_admin_jwt";

// --- token store ---
export function getToken(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export function setToken(t: string) {
  try { localStorage.setItem(KEY, t); } catch {}
}
export function clearToken() {
  try { localStorage.removeItem(KEY); } catch {}
}

// --- headers & fetch helpers ---
export function getAuthHeader(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const auth = getAuthHeader();
  for (const [k, v] of Object.entries(auth)) headers.set(k, v);
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    try { clearToken(); } finally { if (typeof window !== "undefined") window.location.href = "/login"; }
    throw new Error("Unauthorized");
  }
  return res;
}

// Back-compat alias used in some calls
export const adminFetch = authFetch;

// --- login / verify / logout ---
export async function loginWithPassword(username: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await safeJson(res);
  if (!res.ok || !data?.ok || !data?.token) {
    throw new Error(data?.error || "Login failed");
  }
  setToken(data.token);
}

export async function verifyToken(): Promise<boolean> {
  try {
    const res = await authFetch("/api/auth/verify");
    return res.ok;
  } catch {
    return false;
  }
}

export function logout(): void {
  try { clearToken(); } finally { if (typeof window !== "undefined") window.location.href = "/login"; }
}

async function safeJson(resp: Response) {
  try { return await resp.json(); } catch { return null; }
}

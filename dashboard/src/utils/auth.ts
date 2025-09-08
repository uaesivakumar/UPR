// dashboard/src/utils/auth.ts
const KEY = "upr_session_token";

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}
export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}
export function clearToken() {
  localStorage.removeItem(KEY);
}
export function isAuthed(): boolean {
  return Boolean(getToken());
}

const API_BASE =
  (import.meta.env.VITE_API_BASE?.toString().replace(/\/+$/, "") as string) || "";

async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(opts.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const resp = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  return resp;
}

export async function login(username: string, password: string): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) return false;
  const json = await resp.json();
  if (json?.token) setToken(json.token);
  return true;
}

export async function logout(): Promise<void> {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}
  clearToken();
}

export async function fetchLeads(): Promise<{ ok: boolean; data: any[] }> {
  const resp = await api("/api/leads", { method: "GET" });
  if (!resp.ok) throw new Error("Failed to fetch leads");
  return resp.json();
}

export async function createLead(payload: {
  company: string;
  role: string;
  salary_band?: string;
  status?: string;
}): Promise<{ ok: boolean; data: any }> {
  const resp = await api("/api/leads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const msg = await resp.text();
    throw new Error(msg || "Failed to create lead");
  }
  return resp.json();
}

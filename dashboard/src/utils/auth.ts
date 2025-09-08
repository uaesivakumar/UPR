// dashboard/src/utils/auth.ts
const KEY = "upr_admin_token";

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
  import.meta.env.VITE_API_BASE?.toString().replace(/\/+$/, "") || "";

async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(opts.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  const resp = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  return resp;
}

export async function validateToken(token: string): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/api/auth/validate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  return resp.ok;
}

export async function fetchLeads() {
  const resp = await api("/api/leads", { method: "GET" });
  if (!resp.ok) throw new Error("Failed to fetch leads");
  return resp.json();
}

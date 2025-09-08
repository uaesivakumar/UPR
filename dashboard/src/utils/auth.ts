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

// NEW: paged search
export async function fetchLeads(params?: {
  q?: string;
  page?: number;
  page_size?: number;
  sort?: string; // e.g. "created_at:desc", "company:asc"
}): Promise<{ ok: boolean; data: any[]; total: number; page: number; page_size: number; sort: string }> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.sort) qs.set("sort", params.sort);
  const resp = await api(`/api/leads?${qs.toString()}`, { method: "GET" });
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
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function updateLead(
  id: number,
  payload: { company: string; role: string; salary_band?: string; status?: string }
): Promise<{ ok: boolean; data: any }> {
  const resp = await api(`/api/leads/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function deleteLead(id: number): Promise<void> {
  const resp = await api(`/api/leads/${id}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(await resp.text());
}

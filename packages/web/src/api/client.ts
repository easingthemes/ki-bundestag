// Base HTTP helpers for API calls. Auth is handled via session cookies.

const BASE = "/api";

let _onError: ((msg: string) => void) | null = null;

export function setErrorHandler(handler: (msg: string) => void) {
  _onError = handler;
}

// Legacy — kept for backward compatibility but no longer needed with session auth
export function setUserToken(_token: string | null) { /* no-op: sessions use cookies */ }

export function authHeaders(): Record<string, string> {
  return {};
}

export function getBase(): string {
  return BASE;
}

export function triggerError(msg: string) {
  _onError?.(msg);
}

function handleFetchError(err: unknown): never {
  if (err instanceof TypeError && err.message.includes("fetch")) {
    const msg = "Cannot connect to API server. Is it running on port 3001?";
    _onError?.(msg);
  }
  throw err;
}

export async function fetchJson<T>(path: string): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { credentials: "include" });
    if (!res.ok) {
      const msg = `API error: ${res.status} on ${path}`;
      _onError?.(msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err) { return handleFetchError(err); }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = `API error: ${res.status} on POST ${path}`;
      try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* ignore */ }
      _onError?.(msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err) { return handleFetchError(err); }
}

export async function deleteJson<T>(path: string): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const msg = `API error: ${res.status} on DELETE ${path}`;
      _onError?.(msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err) { return handleFetchError(err); }
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = `API error: ${res.status} on PATCH ${path}`;
      try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* ignore */ }
      _onError?.(msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err) { return handleFetchError(err); }
}

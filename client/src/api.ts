const STORAGE_KEY = "aiaccelerator_auth_token";

export function getToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function login(username: string, password: string): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return false;
  }
  if (!res.ok) return false;
  try {
    const body = (await res.json()) as { token: string };
    setToken(body.token);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken() ?? "";
  // Normalise any HeadersInit (plain object, Headers instance or pair array - spreading a Headers
  // instance used to drop every header). Headers lower-cases names, so remove any caller-supplied
  // authorization first and set ours last: callers can never override or duplicate it.
  const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers).entries());
  delete headers.authorization;
  headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) {
    clearToken();
  }
  return res;
}

export const api = {
  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: "Request failed" } }));
      throw new Error(error.error?.message ?? "Request failed");
    }
    return res.json();
  },

  async get<T>(path: string): Promise<T> {
    const res = await apiFetch(path, { method: "GET" });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: "Request failed" } }));
      throw new Error(error.error?.message ?? "Request failed");
    }
    return res.json();
  },

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await apiFetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: "Request failed" } }));
      throw new Error(error.error?.message ?? "Request failed");
    }
    return res.json();
  },
};

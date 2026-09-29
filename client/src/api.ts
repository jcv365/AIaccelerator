const STORAGE_KEY = "aiaccelerator_api_key";

export function getApiKey(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = getApiKey() ?? "";
  const headers = { ...(init.headers as Record<string, string> | undefined), "X-API-Key": key };
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401) {
    clearApiKey();
  }
  return res;
}

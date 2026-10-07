import { getToken } from "../api";

/** Up to two initials from a name: "Ann Lee" -> "AL", "admin" -> "A". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * The signed-in username, read from the token's `sub` claim for display only. Nothing here is trusted: the server
 * verifies the token on every request, so a tampered value can only change what this label says.
 */
export function currentUsername(): string | null {
  const token = getToken();
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

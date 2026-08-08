const rawApiBase =
  (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ??
  (import.meta as { env?: { VITE_API_BASE?: string; BASE_URL?: string } }).env?.VITE_API_BASE ??
  ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL === "/command/" ? "/command" : "");

export const API_BASE = rawApiBase.replace(/\/$/, "");

export function apiUrl(path: string) {
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

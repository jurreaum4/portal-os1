export const API_URL = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "" : "http://localhost:8787")
).replace(/\/+$/, "");
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `API Error ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body.error === "string") message = body.error;
    } catch {
      /* Retain HTTP status if the server did not send JSON. */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

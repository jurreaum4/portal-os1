let staffToken = "";
export function setStaffToken(token: string) {
  staffToken = token;
}
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (staffToken && !headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${staffToken}`);
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401 && staffToken)
      window.dispatchEvent(new Event("portal-session-expired"));
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

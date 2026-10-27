export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data.error === "string") message = data.error;
    } catch {
      /* Preserve status. */
    }
    throw new ApiError(message, response.status);
  }
  return response.json();
}
export function post<T>(path: string, body: unknown = {}) {
  return request<T>(path, { method: "POST", body: JSON.stringify(body) });
}
export interface Item {
  id: string;
  slug: string;
  title: string;
  summary: string;
  type: string;
  priceMinor: number;
  currency: string;
  creatorName: string;
  creatorSlug: string;
}
export function price(item: Item) {
  if (!item.priceMinor) return "Free";
  // Amounts use ISO 4217 minor units, including currencies with zero/three decimals.
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: item.currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(item.priceMinor / 10 ** digits);
}

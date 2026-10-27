export async function authorised(
  request: Request,
  token: string,
): Promise<boolean> {
  const digest = async (value: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    );
  const [actual, expected] = await Promise.all([
    digest(request.headers.get("Authorization") ?? ""),
    digest(`Bearer ${token}`),
  ]);
  return actual.reduce((diff, byte, i) => diff | (byte ^ expected[i]), 0) === 0;
}

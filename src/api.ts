export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-LandLedger-Request", "1");
  const response = await fetch(`/api${url}`, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  const body = await response
    .json()
    .catch(() => ({
      error:
        response.status >= 500
          ? "The server is unavailable. Please try again shortly."
          : "The server returned an unreadable response.",
    }));
  if (!response.ok)
    throw new ApiError(body.error || "The request failed.", response.status);
  return body;
}

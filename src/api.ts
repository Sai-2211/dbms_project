import { getTabId } from "./session";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function sessionExpired() {
  window.dispatchEvent(new Event("landledger:session-expired"));
}
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
) {
  const headers = new Headers(options.headers);
  headers.set("X-LandLedger-Tab", await getTabId());
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (options.method && options.method !== "GET")
    headers.set("X-LandLedger-Request", "1");
  const response = await fetch(`/api${url}`, {
    credentials: "same-origin",
    ...options,
    headers,
  });
  if (response.status === 401 && !["/auth/login", "/auth/signup"].includes(url))
    sessionExpired();
  return response;
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authenticatedFetch(url, options);
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
export async function downloadFile(url: string, filename: string) {
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(body.error || "The download failed.", response.status);
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

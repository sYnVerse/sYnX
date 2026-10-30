import { getRefreshedCookies } from "./auth.server";
import { applySecurityHeaders } from "./security-headers";

/**
 * Wraps the Remix response for the worker: adds the security headers and any
 * session cookies refreshed while handling `request`.
 */
export function finalizeWorkerResponse(request: Request, response: Response): Response {
  const headers = applySecurityHeaders(new Headers(response.headers));
  const refreshedCookies = getRefreshedCookies(request);
  for (const cookie of refreshedCookies) {
    headers.append("Set-Cookie", cookie);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** The worker's response when handling a request throws. */
export function unexpectedErrorResponse(): Response {
  return new Response("An unexpected error occurred", {
    status: 500,
    headers: applySecurityHeaders(new Headers()),
  });
}

import { describe, it, expect } from "vitest";
import { SECURITY_HEADERS, applySecurityHeaders } from "../app/security-headers";
import { finalizeWorkerResponse, unexpectedErrorResponse } from "../app/worker-response.server";
import { recordRefreshedCookies } from "../app/auth.server";

const EXPECTED: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function expectSecurityHeaders(headers: Headers) {
  for (const [name, value] of Object.entries(EXPECTED)) {
    expect(headers.get(name)).toBe(value);
  }
}

describe("security headers", () => {
  it("defines the expected headers", () => {
    expect({ ...SECURITY_HEADERS }).toEqual(EXPECTED);
  });

  it("applySecurityHeaders sets them and replaces weaker values", () => {
    const headers = applySecurityHeaders(new Headers({ "X-Frame-Options": "SAMEORIGIN" }));
    expectSecurityHeaders(headers);
  });

  it("adds them to worker responses and keeps the status, body, headers and refreshed cookies", async () => {
    const request = new Request("https://synx.test/app");
    recordRefreshedCookies(request, ["synx_auth_session=new; Path=/"]);
    const response = finalizeWorkerResponse(
      request,
      new Response("hello", { status: 201, statusText: "Created", headers: { "Content-Type": "text/plain" } }),
    );
    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Set-Cookie")).toBe("synx_auth_session=new; Path=/");
    expectSecurityHeaders(response.headers);
    expect(await response.text()).toBe("hello");
  });

  it("adds them to the error response", async () => {
    const response = unexpectedErrorResponse();
    expect(response.status).toBe(500);
    expectSecurityHeaders(response.headers);
    expect(await response.text()).toBe("An unexpected error occurred");
  });
});

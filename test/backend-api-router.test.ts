import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { env as workerEnv } from "cloudflare:test";
import { handleApiRequest } from "../backend/api/router";
import { cloudflareContext } from "../backend/services/context.server";
import { apiAuthContext } from "../backend/services/auth-context.server";
import * as authServer from "../backend/services/auth.server";

function createProvider(envOverrides: Record<string, unknown> = {}): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, {
    env: { DB: workerEnv.DB, ...envOverrides } as unknown as Env,
    ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
  });
  return provider;
}

describe("backend/api/router handleApiRequest (#193)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null for non-/api/v1 paths so React Router handles web SSR", async () => {
    const verifySpy = vi.spyOn(authServer, "verifyBearerToken");

    for (const url of [
      "https://synx.christran.io/",
      "https://synx.christran.io/list-123",
      "https://synx.christran.io/login",
      "https://synx.christran.io/api/v2/lists",
    ]) {
      const res = await handleApiRequest(new Request(url), createProvider());
      expect(res).toBeNull();
    }

    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown /api/v1/* endpoints and /api/v1 root", async () => {
    for (const url of [
      "https://synx.christran.io/api/v1",
      "https://synx.christran.io/api/v1/",
      "https://synx.christran.io/api/v1/does-not-exist",
    ]) {
      const res = await handleApiRequest(new Request(url), createProvider());
      expect(res?.status).toBe(404);
    }
  });

  it("serves public /api/v1/mobile/version without auth and enforces GET-only", async () => {
    const verifySpy = vi.spyOn(authServer, "verifyBearerToken");

    const getRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/mobile/version"),
      createProvider()
    );
    expect(getRes?.status).toBe(200);
    const body = (await getRes?.json()) as { latest?: unknown };
    expect(body.latest).toBeTruthy();

    const trailingRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/mobile/version/"),
      createProvider()
    );
    expect(trailingRes?.status).toBe(200);

    const postRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/mobile/version", { method: "POST" }),
      createProvider()
    );
    expect(postRes?.status).toBe(405);

    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("routes /api/v1/dev/test-login without auth resolution", async () => {
    const verifySpy = vi.spyOn(authServer, "verifyBearerToken");

    const getRes = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/v1/dev/test-login"),
      createProvider()
    );
    expect(getRes?.status).toBe(404);

    const postNoFlag = await handleApiRequest(
      new Request("http://127.0.0.1:8787/api/v1/dev/test-login", { method: "POST" }),
      createProvider({ ALLOW_DEV_TEST_AUTH: "false" })
    );
    expect(postNoFlag?.status).toBe(404);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("prefers static routes over :id params (/api/v1/todos/clear-completed and /api/v1/completions/export)", async () => {
    const verifySpy = vi.spyOn(authServer, "verifyBearerToken").mockResolvedValue(null);

    const clearRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/todos/clear-completed?listId=list-1", {
        method: "POST",
      }),
      createProvider()
    );
    // Reaches todos.clear-completed (401 Unauthorized), not todos.$id
    expect(clearRes?.status).toBe(401);

    const clearGetRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/todos/clear-completed"),
      createProvider()
    );
    // Static todos.clear-completed exports only action -> 405 on GET
    expect(clearGetRes?.status).toBe(405);

    const exportRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/completions/export"),
      createProvider()
    );
    expect(exportRes?.status).toBe(401);
    expect(verifySpy).toHaveBeenCalledTimes(3);
  });

  it("decodes :id params cleanly and rejects malformed percent-encoding with 400", async () => {
    const badRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/lists/%E0%A4%A"),
      createProvider()
    );
    expect(badRes?.status).toBe(400);

    vi.spyOn(authServer, "verifyBearerToken").mockResolvedValue(null);
    const encodedRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/lists/list%20one", { method: "DELETE" }),
      createProvider()
    );
    // DELETE /api/v1/lists/:id requires auth and returns 401 when unauthenticated
    expect(encodedRes?.status).toBe(401);

    // Also verify decoded ID reaches parameterized loader (DB lookup for "list one" -> 404)
    const getRes = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/lists/list%20one"),
      createProvider()
    );
    expect(getRes?.status).toBe(404);
  });

  it("resolves bearer auth once per protected API request and returns 405 for wrong methods", async () => {
    const verifySpy = vi.spyOn(authServer, "verifyBearerToken").mockResolvedValue({
      userId: "user-router-1",
      email: "router@example.com",
      token: "tok-router",
    });

    const context = createProvider();
    const res = await handleApiRequest(
      new Request("https://synx.christran.io/api/v1/delete-requests/req-1", {
        method: "GET",
        headers: { Authorization: "Bearer tok-router" },
      }),
      context
    );

    expect(res?.status).toBe(405);
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(context.get(apiAuthContext)?.user?.userId).toBe("user-router-1");
  });
});

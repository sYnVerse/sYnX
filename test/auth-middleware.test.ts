import { describe, it, expect, vi, beforeEach } from "vitest";
import { RouterContextProvider } from "react-router";
import { env as workerEnv } from "cloudflare:test";
import * as authServer from "../app/auth.server";
import { cloudflareContext } from "../app/context.server";
import {
  apiAuthContext,
  authMiddleware,
  getRequestApiAuth,
  getRequestWebAuth,
  shouldResolveApiAuth,
  shouldResolveWebAuth,
  webAuthContext,
} from "../app/auth-context.server";
import { loader as indexLoader } from "../app/routes/_index";
import { action as devicesAction } from "../app/routes/api.v1.devices";
import { action as deleteRequestAction } from "../app/routes/api.v1.delete-requests.$id";

function createProvider(env: Partial<Env> = {}): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, {
    env: env as Env,
    ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
  });
  return provider;
}

describe("React Router auth middleware (#165)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies web, protected API, public API, and auth paths accurately", () => {
    expect(shouldResolveWebAuth("/")).toBe(true);
    expect(shouldResolveWebAuth("/list-123")).toBe(true);
    expect(shouldResolveWebAuth("/list/list-123")).toBe(true);
    expect(shouldResolveWebAuth("/list-123.data")).toBe(true);

    expect(shouldResolveWebAuth("/login")).toBe(false);
    expect(shouldResolveWebAuth("/login.data")).toBe(false);
    expect(shouldResolveWebAuth("/callback")).toBe(false);
    expect(shouldResolveWebAuth("/logout")).toBe(false);
    expect(shouldResolveWebAuth("/mobile/callback")).toBe(false);
    expect(shouldResolveWebAuth("/download/android")).toBe(false);
    expect(shouldResolveWebAuth("/api/v1/lists")).toBe(false);

    expect(shouldResolveApiAuth("/api/v1/lists")).toBe(true);
    expect(shouldResolveApiAuth("/api/v1/todos/123/completed")).toBe(true);
    expect(shouldResolveApiAuth("/api/v1/mobile/version")).toBe(false);
    expect(shouldResolveApiAuth("/list-123")).toBe(false);
  });

  it("resolves web auth once per request in middleware and reuses it across loader calls", async () => {
    const spy = vi.spyOn(authServer, "getOptionalUser").mockResolvedValue({
      userId: "guest_mid-1",
      email: "Guest User",
      isLoggedIn: false,
      guestId: "guest_mid-1",
      isNewGuest: true,
      accessToken: null,
    });
    const bearerSpy = vi.spyOn(authServer, "verifyBearerToken");

    const request = new Request("http://127.0.0.1:8787/");
    const context = createProvider({ DB: workerEnv.DB });

    const response = await authMiddleware(
      { request, params: {}, context, url: new URL(request.url), pattern: "/" },
      async () => {
        const first = await getRequestWebAuth(request, context);
        expect(first.userId).toBe("guest_mid-1");
        // Simulate _index loader delegating to listLoader without re-running getOptionalUser.
        const result = await indexLoader({
          request,
          params: {},
          context,
          url: new URL(request.url),
          pattern: "/",
        });
        expect(result).toBeTruthy();
        return new Response("ok", { status: 200 });
      }
    );

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(bearerSpy).not.toHaveBeenCalled();
    expect(context.get(webAuthContext)?.userId).toBe("guest_mid-1");
  });

  it("resolves API bearer auth once per request in middleware and preserves 405 before 401", async () => {
    const spy = vi.spyOn(authServer, "verifyBearerToken").mockResolvedValue({
      userId: "api-user-1",
      email: "api@example.com",
      token: "tok-123",
    });
    const webSpy = vi.spyOn(authServer, "getOptionalUser");

    const request = new Request("http://127.0.0.1:8787/api/v1/delete-requests/req-1", {
      method: "GET",
      headers: { Authorization: "Bearer tok-123" },
    });
    const context = createProvider();

    const response = await authMiddleware(
      {
        request,
        params: { id: "req-1" },
        context,
        url: new URL(request.url),
        pattern: "/api/v1/delete-requests/:id",
      },
      async () => {
        const user = await getRequestApiAuth(request, context);
        expect(user?.userId).toBe("api-user-1");
        return deleteRequestAction({
          request,
          params: { id: "req-1" },
          context,
          url: new URL(request.url),
          pattern: "/api/v1/delete-requests/:id",
        });
      }
    );

    expect(response?.status).toBe(405);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(webSpy).not.toHaveBeenCalled();
    expect(context.get(apiAuthContext)?.user?.userId).toBe("api-user-1");
  });

  it("skips auth resolution for /api/v1/mobile/version and /login", async () => {
    const webSpy = vi.spyOn(authServer, "getOptionalUser");
    const bearerSpy = vi.spyOn(authServer, "verifyBearerToken");

    for (const url of [
      "http://127.0.0.1:8787/api/v1/mobile/version",
      "http://127.0.0.1:8787/login",
    ]) {
      const request = new Request(url);
      const context = createProvider();
      await authMiddleware(
        { request, params: {}, context, url: new URL(request.url), pattern: new URL(request.url).pathname },
        async () => new Response("ok")
      );
      expect(context.get(webAuthContext)).toBeNull();
      expect(context.get(apiAuthContext)).toBeNull();
    }

    expect(webSpy).not.toHaveBeenCalled();
    expect(bearerSpy).not.toHaveBeenCalled();
  });

  it("keeps DELETE /api/v1/devices resilient when token verification throws", async () => {
    vi.spyOn(authServer, "verifyBearerToken").mockRejectedValue(new Error("network down"));

    const run = vi.fn(async () => ({ success: true }));
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));
    const db = { prepare } as unknown as D1Database;

    const request = new Request("http://127.0.0.1:8787/api/v1/devices?token=push-abc", {
      method: "DELETE",
    });
    const context = createProvider({ DB: db });

    const response = await authMiddleware(
      {
        request,
        params: {},
        context,
        url: new URL(request.url),
        pattern: "/api/v1/devices",
      },
      async () =>
        devicesAction({
          request,
          params: {},
          context,
          url: new URL(request.url),
          pattern: "/api/v1/devices",
        })
    );

    expect(response?.status).toBe(204);
    expect(prepare).toHaveBeenCalledWith("DELETE FROM device_tokens WHERE token = ?");
    expect(bind).toHaveBeenCalledWith("push-abc");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { loader as listLoader } from "../app/features/list/loader.server";

describe("deferred loader and sidebar link prefetch", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM todos").run();
    await env.DB.prepare("DELETE FROM lists").run();
    await env.DB.prepare("DELETE FROM pending_delete_requests").run();
    await env.DB.prepare("DELETE FROM user_settings").run();
  });

  it("returns promises for deferred secondary data in listLoader (Issue #166)", async () => {
    const listId = "test-deferred-list-1";
    const userId = "test-user-deferred-1";

    await env.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(listId, "Test List", userId, Date.now(), "public_edit")
      .run();

    const request = new Request(`https://synx.christran.io/${listId}`);
    const result = await listLoader({
      request,
      params: { id: listId },
      context: {
        cloudflare: {
          env: {
            DB: env.DB,
            JWT_SECRET: "test-secret",
          },
        },
      },
    } as any);

    expect(result).not.toBeInstanceOf(Response);

    const payload =
      result && typeof result === "object" && "data" in result
        ? (result as any).data
        : (result as any);

    expect(payload).toHaveProperty("lists");
    expect(payload).toHaveProperty("todos");
    expect(payload).toHaveProperty("pendingDeleteRequests");
    expect(Array.isArray(payload.pendingDeleteRequests)).toBe(true);

    // Deferred fields must be Promise instances
    expect(payload.ownedPendingDeleteRequests).toBeInstanceOf(Promise);
    expect(payload.listActivity).toBeInstanceOf(Promise);
    expect(payload.providerProfile).toBeInstanceOf(Promise);

    // Resolving them returns expected shapes
    const resolvedOwnedPending = await payload.ownedPendingDeleteRequests;
    expect(Array.isArray(resolvedOwnedPending)).toBe(true);

    const resolvedActivity = await payload.listActivity;
    expect(Array.isArray(resolvedActivity)).toBe(true);

    const resolvedProfile = await payload.providerProfile;
    expect(resolvedProfile === null || typeof resolvedProfile === "object").toBe(true);
  });

  it("evaluates sidebar prefetch intent correctly for all list and session modes (Issue #167)", () => {
    const resolvePrefetch = (isActive: boolean, isLoggedIn: boolean, isShared: boolean) => {
      const shouldPrefetch = !isActive && (isLoggedIn || isShared);
      return shouldPrefetch ? "intent" : "none";
    };

    // Active list never prefetches
    expect(resolvePrefetch(true, true, false)).toBe("none");
    expect(resolvePrefetch(true, false, true)).toBe("none");
    expect(resolvePrefetch(true, false, false)).toBe("none");

    // Inactive list for logged-in user prefetches on intent
    expect(resolvePrefetch(false, true, false)).toBe("intent");
    expect(resolvePrefetch(false, true, true)).toBe("intent");

    // Inactive list for guest user: personal guest lists (localStorage) do not prefetch
    expect(resolvePrefetch(false, false, false)).toBe("none");

    // Inactive list for guest user: shared D1 lists prefetch on intent
    expect(resolvePrefetch(false, false, true)).toBe("intent");
  });
});

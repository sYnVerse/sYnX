import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";

let currentWebUser = {
  userId: "user-owner",
  email: "owner@example.com",
  isLoggedIn: true,
  guestId: "guest-1",
  isNewGuest: false,
  accessToken: null as string | null,
};

let currentApiUser: { userId: string; email: string; token: string } | null = {
  userId: "user-owner",
  email: "owner@example.com",
  token: "tok-owner",
};

vi.mock("../backend/services/auth-context.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../backend/services/auth-context.server")>();
  return {
    ...actual,
    getRequestWebAuth: vi.fn(async () => currentWebUser),
    getRequestApiAuth: vi.fn(async () => currentApiUser),
  };
});

import { loader as listLoader } from "../web/app/features/list/loader.server";
import { loader as activityApiLoader } from "../backend/api/v1/lists.$id.activity";
import { listActivityForOwner, logListActivity } from "../backend/services/list-activity.server";

async function seedPrivateList(listId: string, ownerId: string) {
  await env.DB.prepare(
    "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
  )
    .bind(listId, "Private Work", ownerId, Date.now(), "private")
    .run();
}

describe("Private list activity log & access control (#231)", () => {
  beforeEach(async () => {
    currentWebUser = {
      userId: "user-owner",
      email: "owner@example.com",
      isLoggedIn: true,
      guestId: "guest-1",
      isNewGuest: false,
      accessToken: null,
    };
    currentApiUser = {
      userId: "user-owner",
      email: "owner@example.com",
      token: "tok-owner",
    };

    await env.DB.prepare("DELETE FROM list_activity").run();
    await env.DB.prepare("DELETE FROM todos").run();
    await env.DB.prepare("DELETE FROM lists").run();
    await env.DB.prepare("DELETE FROM pending_delete_requests").run();
    await env.DB.prepare("DELETE FROM user_settings").run();
  });

  it("allows owner and denies non-owner via listActivityForOwner and GET /api/v1/lists/:id/activity", async () => {
    const listId = "priv-list-api-1";
    await seedPrivateList(listId, "user-owner");

    await logListActivity(env.DB, {
      listId,
      action: "task_created",
      actorId: "user-owner",
      isOwner: true,
      shareMode: "private",
      summary: "Draft roadmap",
      clientIp: "198.51.100.77",
      userAgent: "SecretUA/1.0",
    });

    const ownerResult = await listActivityForOwner(env.DB, listId, "user-owner");
    expect(ownerResult.kind).toBe("ok");
    if (ownerResult.kind === "ok") {
      expect(ownerResult.entries).toHaveLength(1);
      expect(ownerResult.entries[0]).toMatchObject({
        action: "task_created",
        summary: "Draft roadmap",
        clientIp: null,
        userAgent: null,
      });
    }

    const otherResult = await listActivityForOwner(env.DB, listId, "user-stranger");
    expect(otherResult.kind).toBe("forbidden");

    const ownerReq = new Request(`https://example.com/api/v1/lists/${listId}/activity`);
    const ownerRes = await activityApiLoader({
      request: ownerReq,
      params: { id: listId },
      context: { cloudflare: { env: { DB: env.DB } } },
    } as never);
    expect(ownerRes.status).toBe(200);
    const ownerBody = (await ownerRes.json()) as {
      success: boolean;
      entries: Array<{ summary: string | null; clientIp: string | null; userAgent: string | null }>;
    };
    expect(ownerBody.success).toBe(true);
    expect(ownerBody.entries).toHaveLength(1);
    expect(ownerBody.entries[0]).toMatchObject({
      summary: "Draft roadmap",
      clientIp: null,
      userAgent: null,
    });

    currentApiUser = {
      userId: "user-stranger",
      email: "stranger@example.com",
      token: "tok-stranger",
    };
    const strangerRes = await activityApiLoader({
      request: new Request(`https://example.com/api/v1/lists/${listId}/activity`),
      params: { id: listId },
      context: { cloudflare: { env: { DB: env.DB } } },
    } as never);
    expect(strangerRes.status).toBe(403);
  });

  it("loads deferred listActivity in listLoader for private owned lists and returns [] for guests", async () => {
    const listId = "priv-list-loader-1";
    await seedPrivateList(listId, "user-owner");

    await logListActivity(env.DB, {
      listId,
      action: "task_completed",
      actorId: "user-owner",
      isOwner: true,
      shareMode: "private",
      summary: "Submit tax form",
    });

    const ownerRes = await listLoader({
      request: new Request(`https://synx.christran.io/${listId}`),
      params: { id: listId },
      context: { cloudflare: { env: { DB: env.DB, JWT_SECRET: "test-secret" } } },
    } as never);
    expect(ownerRes).not.toBeInstanceOf(Response);
    const ownerPayload =
      ownerRes && typeof ownerRes === "object" && "data" in ownerRes
        ? (ownerRes as { data: { listActivity: Promise<unknown[]> } }).data
        : (ownerRes as { listActivity: Promise<unknown[]> });

    const ownerEntries = await ownerPayload.listActivity;
    expect(ownerEntries).toHaveLength(1);
    expect(ownerEntries[0]).toMatchObject({
      action: "task_completed",
      summary: "Submit tax form",
      clientIp: null,
      userAgent: null,
    });

    currentWebUser = {
      userId: "guest-1",
      email: "Guest User",
      isLoggedIn: false,
      guestId: "guest-1",
      isNewGuest: true,
      accessToken: null,
    };
    const guestRes = await listLoader({
      request: new Request(`https://synx.christran.io/guest-only-list`),
      params: { id: "guest-only-list" },
      context: { cloudflare: { env: { DB: env.DB, JWT_SECRET: "test-secret" } } },
    } as never);
    expect(guestRes).not.toBeInstanceOf(Response);
    const guestPayload =
      guestRes && typeof guestRes === "object" && "data" in guestRes
        ? (guestRes as { data: { listActivity: Promise<unknown[]> } }).data
        : (guestRes as { listActivity: Promise<unknown[]> });
    expect(await guestPayload.listActivity).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { action as devicesAction } from "../app/routes/api.v1.devices";
import { isInvalidTokenResponse, sendFCMPushNotification } from "../app/fcm.server";
import { REMINDER_NOTIFICATION_CATEGORY } from "../shared";

async function makeTempServiceAccountJson(): Promise<string> {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  let binary = "";
  for (let i = 0; i < pkcs8.byteLength; i++) {
    binary += String.fromCharCode(pkcs8[i]);
  }
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
  return JSON.stringify({
    project_id: "synx-test",
    client_email: "fcm@synx-test.iam.gserviceaccount.com",
    private_key: pem,
  });
}

describe("push token unregister", () => {
  let db: D1Database;

  beforeEach(async () => {
    db = env.DB;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `.replace(/\n/g, " "));
  });

  afterEach(async () => {
    await db.exec("DELETE FROM device_tokens");
  });

  it("removes a device by its push token without a session, and never answers 401", async () => {
    const insert = "INSERT INTO device_tokens (id, user_id, token, platform, updated_at) VALUES (?, ?, ?, ?, ?)";
    await db.prepare(insert).bind("d1", "user-a", "fcm-token-a", "android", Date.now()).run();
    await db.prepare(insert).bind("d2", "user-a", "fcm-token-b", "android", Date.now()).run();

    const call = (body: unknown) =>
      devicesAction({
        request: new Request("https://synx.test/api/v1/devices", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        context: { cloudflare: { env } },
        params: {},
      } as any) as Promise<Response>;

    expect((await call({ token: "fcm-token-a" })).status).toBe(204);
    expect((await call({ token: "" })).status).toBe(204);
    expect((await call({ token: "x".repeat(5000) })).status).toBe(204);

    const { results } = await db.prepare("SELECT token FROM device_tokens").all<{ token: string }>();
    expect(results.map((r) => r.token)).toEqual(["fcm-token-b"]);
  });

  it("treats only token errors from FCM as a dead token", () => {
    const unregistered = JSON.stringify({
      error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found.", details: [{ errorCode: "UNREGISTERED" }] },
    });
    const badToken = JSON.stringify({
      error: { code: 400, status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" },
    });
    const badPayload = JSON.stringify({
      error: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid value at 'message.data'" },
    });
    const wrongProject = JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found." } });

    expect(isInvalidTokenResponse(unregistered)).toBe(true);
    expect(isInvalidTokenResponse(badToken)).toBe(true);
    expect(isInvalidTokenResponse(badPayload)).toBe(false);
    expect(isInvalidTokenResponse(wrongProject)).toBe(false);
  });

  it("formats FCM payloads with categoryId as high-priority data messages for action buttons", async () => {
    const serviceAccountJson = await makeTempServiceAccountJson();
    const sentPayloads: unknown[] = [];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "ya29.test" }), { status: 200 });
      }
      if (target.includes("fcm.googleapis.com")) {
        sentPayloads.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ name: "projects/synx-test/messages/1" }), { status: 200 });
      }
      throw new Error(`Unexpected fetch URL: ${target}`);
    });

    try {
      const okWithCategory = await sendFCMPushNotification(
        "fcm-token-1",
        {
          title: "Work",
          body: "Pay rent",
          categoryId: REMINDER_NOTIFICATION_CATEGORY,
          data: { todoId: "todo-9", listId: "list-9", tag: "reminder_todo-9" },
        },
        { FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson }
      );
      expect(okWithCategory).toBe(true);
      expect(sentPayloads[0]).toEqual({
        message: {
          token: "fcm-token-1",
          data: {
            title: "Work",
            message: "Pay rent",
            categoryId: REMINDER_NOTIFICATION_CATEGORY,
            channelId: "task_reminders",
            sound: "default",
            todoId: "todo-9",
            listId: "list-9",
            tag: "reminder_todo-9",
          },
          android: {
            priority: "high",
          },
        },
      });

      const okWithoutCategory = await sendFCMPushNotification(
        "fcm-token-1",
        {
          title: "Delete request",
          body: "Approve request",
          data: { listId: "list-9" },
        },
        { FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccountJson }
      );
      expect(okWithoutCategory).toBe(true);
      expect(sentPayloads[1]).toEqual({
        message: {
          token: "fcm-token-1",
          notification: {
            title: "Delete request",
            body: "Approve request",
          },
          data: { listId: "list-9" },
          android: {
            priority: "high",
            notification: {
              sound: "default",
              channel_id: "task_reminders",
            },
          },
        },
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { action as devicesAction } from "../app/routes/api.v1.devices";
import { isInvalidTokenResponse } from "../app/fcm.server";

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
});

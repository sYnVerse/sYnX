import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { env } from "cloudflare:test";
import { action as settingsAction } from "../app/routes/api.v1.settings";
import {
  MAX_PHONE_CARRIER_LENGTH,
  MAX_PHONE_NUMBER_LENGTH,
  phoneSettingsError,
} from "../app/write-limits";

// Skip real token verification: every request is this user.
vi.mock("../app/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/auth.server")>();
  return {
    ...actual,
    verifyBearerToken: vi.fn(async () => ({
      userId: "settings-limit-user",
      email: "limits@example.com",
      token: "test-token",
    })),
  };
});

function putSettings(body: Record<string, unknown>): Promise<Response> {
  const args = {
    request: new Request("https://synx.test/api/v1/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: JSON.stringify(body),
    }),
    params: {},
    context: { cloudflare: { env } },
  } as unknown as ActionFunctionArgs;
  return settingsAction(args);
}

describe("phone settings length limits", () => {
  afterEach(async () => {
    await env.DB.exec("DELETE FROM user_settings");
  });

  it("uses 32 characters for the phone number and 64 for the carrier", () => {
    expect(MAX_PHONE_NUMBER_LENGTH).toBe(32);
    expect(MAX_PHONE_CARRIER_LENGTH).toBe(64);
  });

  // The web settings action in $id.tsx and the REST route both call this.
  it("phoneSettingsError accepts values at the limit and rejects longer ones", () => {
    expect(phoneSettingsError("1".repeat(32), "c".repeat(64))).toBeNull();
    expect(phoneSettingsError("1".repeat(33), "")).toBe("Phone number is too long");
    expect(phoneSettingsError("", "c".repeat(65))).toBe("Phone carrier is too long");
  });

  describe("PUT /api/v1/settings", () => {
    beforeEach(async () => {
      await env.DB.exec("DELETE FROM user_settings");
    });

    it("rejects a phone number over 32 characters", async () => {
      const res = await putSettings({ phoneNumber: "1".repeat(33), phoneCarrier: "tmobile" });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Phone number is too long" });
      const row = await env.DB.prepare("SELECT user_id FROM user_settings").first();
      expect(row).toBeNull();
    });

    it("rejects a phone carrier over 64 characters", async () => {
      const res = await putSettings({ phoneNumber: "+15555550100", phoneCarrier: "c".repeat(65) });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Phone carrier is too long" });
    });

    it("saves values exactly at the limits", async () => {
      const phoneNumber = "1".repeat(32);
      const phoneCarrier = "c".repeat(64);
      const res = await putSettings({ smsEnabled: true, phoneNumber, phoneCarrier });
      expect(res.status).toBe(200);

      const row = await env.DB
        .prepare("SELECT phone_number, phone_carrier FROM user_settings WHERE user_id = ?")
        .bind("settings-limit-user")
        .first<{ phone_number: string; phone_carrier: string }>();
      expect(row).toEqual({ phone_number: phoneNumber, phone_carrier: phoneCarrier });
    });
  });
});

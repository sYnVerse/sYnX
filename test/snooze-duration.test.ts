import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { env as workerEnv } from "cloudflare:test";
import {
  DEFAULT_REMINDER_SNOOZE_MINUTES,
  MAX_REMINDER_SNOOZE_MINUTES,
  MIN_REMINDER_SNOOZE_MINUTES,
  REMINDER_SNOOZE_PRESET_MINUTES,
  formatReminderSnoozeLabel,
  isValidReminderSnoozeMinutes,
  parseCustomSnoozeMinutesInput,
  parseReminderSnoozeMinutesInput,
  reminderSnoozeDurationMs,
  resolveReminderSnoozeMinutes,
} from "../shared";
import { handleApiRequest } from "../backend/api/router";
import { cloudflareContext } from "../backend/services/context.server";
import * as authContext from "../backend/services/auth-context.server";

const USER = { userId: "snooze-user-1", email: "snooze-user@example.com" };

let currentApiUser: { userId: string; email: string; token: string } | null = {
  userId: USER.userId,
  email: USER.email,
  token: "tok-snooze",
};

function makeContext(): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, {
    env: { DB: workerEnv.DB } as unknown as Env,
    ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
  });
  return provider;
}

describe("Issue #211 shared snooze helpers", () => {
  it("exposes expected presets, bounds, and defaults", () => {
    expect(DEFAULT_REMINDER_SNOOZE_MINUTES).toBe(10);
    expect(MIN_REMINDER_SNOOZE_MINUTES).toBe(1);
    expect(MAX_REMINDER_SNOOZE_MINUTES).toBe(1440);
    expect(REMINDER_SNOOZE_PRESET_MINUTES).toEqual([5, 10, 15, 30, 60]);
  });

  it("validates integer minute bounds (1..1440)", () => {
    expect(isValidReminderSnoozeMinutes(1)).toBe(true);
    expect(isValidReminderSnoozeMinutes(10)).toBe(true);
    expect(isValidReminderSnoozeMinutes(1440)).toBe(true);
    expect(isValidReminderSnoozeMinutes(0)).toBe(false);
    expect(isValidReminderSnoozeMinutes(-5)).toBe(false);
    expect(isValidReminderSnoozeMinutes(1441)).toBe(false);
    expect(isValidReminderSnoozeMinutes(10.5)).toBe(false);
    expect(isValidReminderSnoozeMinutes("10")).toBe(false);
    expect(isValidReminderSnoozeMinutes(null)).toBe(false);
  });

  it("resolves stored numbers or numeric strings cleanly and falls back to 10", () => {
    expect(resolveReminderSnoozeMinutes(undefined)).toBe(10);
    expect(resolveReminderSnoozeMinutes(null)).toBe(10);
    expect(resolveReminderSnoozeMinutes(30)).toBe(30);
    expect(resolveReminderSnoozeMinutes(" 45 ")).toBe(45);
    expect(resolveReminderSnoozeMinutes("0")).toBe(10);
    expect(resolveReminderSnoozeMinutes("1441")).toBe(10);
    expect(resolveReminderSnoozeMinutes("12.5")).toBe(10);
    expect(resolveReminderSnoozeMinutes("abc")).toBe(10);
  });

  it("validates API and custom text snooze inputs", () => {
    expect(parseReminderSnoozeMinutesInput(null)).toEqual({ ok: true, minutes: null });
    expect(parseReminderSnoozeMinutesInput(1)).toEqual({ ok: true, minutes: 1 });
    expect(parseReminderSnoozeMinutesInput(1440)).toEqual({ ok: true, minutes: 1440 });
    expect(parseReminderSnoozeMinutesInput(0).ok).toBe(false);
    expect(parseReminderSnoozeMinutesInput(1441).ok).toBe(false);
    expect(parseReminderSnoozeMinutesInput(5.5).ok).toBe(false);
    expect(parseReminderSnoozeMinutesInput("15").ok).toBe(false);

    expect(parseCustomSnoozeMinutesInput(" 15 ")).toEqual({ ok: true, minutes: 15 });
    expect(parseCustomSnoozeMinutesInput("1440")).toEqual({ ok: true, minutes: 1440 });
    expect(parseCustomSnoozeMinutesInput("").ok).toBe(false);
    expect(parseCustomSnoozeMinutesInput("0").ok).toBe(false);
    expect(parseCustomSnoozeMinutesInput("-10").ok).toBe(false);
    expect(parseCustomSnoozeMinutesInput("10.5").ok).toBe(false);
    expect(parseCustomSnoozeMinutesInput("1441").ok).toBe(false);
    expect(parseCustomSnoozeMinutesInput("ten").ok).toBe(false);
  });

  it("computes duration ms and labels accurately", () => {
    expect(reminderSnoozeDurationMs(undefined)).toBe(10 * 60 * 1000);
    expect(reminderSnoozeDurationMs(25)).toBe(25 * 60 * 1000);
    expect(formatReminderSnoozeLabel(1)).toBe("1 min");
    expect(formatReminderSnoozeLabel(null)).toBe("10 min");
    expect(formatReminderSnoozeLabel(60)).toBe("60 min");
  });
});

describe("Issue #211 /api/v1/settings snoozeMinutes D1 persistence", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    currentApiUser = {
      userId: USER.userId,
      email: USER.email,
      token: "tok-snooze",
    };
    vi.spyOn(authContext, "getRequestApiAuth").mockImplementation(async () => currentApiUser);
  });

  afterEach(async () => {
    await workerEnv.DB.exec("DELETE FROM user_settings");
  });

  it("defaults snoozeMinutes to 10 on GET and enforces auth", async () => {
    currentApiUser = null;
    const unauth = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings"),
      makeContext(),
    );
    expect(unauth?.status).toBe(401);

    currentApiUser = { userId: USER.userId, email: USER.email, token: "tok-snooze" };
    const getRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings"),
      makeContext(),
    );
    expect(getRes?.status).toBe(200);
    const json = (await getRes?.json()) as { settings: { snoozeMinutes: number } };
    expect(json.settings.snoozeMinutes).toBe(10);
  });

  it("persists snoozeMinutes cleanly across partial and full PUT updates without clobbering other fields", async () => {
    // 1. Save full notification + displayName settings first
    const fullPut = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: true,
          smsEnabled: false,
          phoneNumber: "",
          phoneCarrier: "",
          discordWebhookUrl: "",
          displayName: "Chris",
          archiveSuggestionsEnabled: false,
        }),
      }),
      makeContext(),
    );
    expect(fullPut?.status).toBe(200);

    // 2. Partial PUT updating only snoozeMinutes preserves emailEnabled, displayName, archiveSuggestionsEnabled
    const partialSnooze = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozeMinutes: 1440 }),
      }),
      makeContext(),
    );
    expect(partialSnooze?.status).toBe(200);
    const partialJson = (await partialSnooze?.json()) as {
      settings: {
        snoozeMinutes: number;
        emailEnabled: boolean;
        displayName: string;
        archiveSuggestionsEnabled: boolean;
      };
    };
    expect(partialJson.settings.snoozeMinutes).toBe(1440);
    expect(partialJson.settings.emailEnabled).toBe(true);
    expect(partialJson.settings.displayName).toBe("Chris");
    expect(partialJson.settings.archiveSuggestionsEnabled).toBe(false);

    // 3. Subsequent notification-only PUT must NOT reset snooze_minutes
    const notifPut = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: false,
          smsEnabled: false,
          phoneNumber: "",
          phoneCarrier: "",
          discordWebhookUrl: "",
        }),
      }),
      makeContext(),
    );
    expect(notifPut?.status).toBe(200);
    const notifJson = (await notifPut?.json()) as { settings: { snoozeMinutes: number; emailEnabled: boolean } };
    expect(notifJson.settings.emailEnabled).toBe(false);
    expect(notifJson.settings.snoozeMinutes).toBe(1440);

    // 4. Lower boundary 1 minute
    const minPut = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozeMinutes: 1 }),
      }),
      makeContext(),
    );
    expect(minPut?.status).toBe(200);
    expect(((await minPut?.json()) as { settings: { snoozeMinutes: number } }).settings.snoozeMinutes).toBe(1);

    // 5. Reset via null -> restores default 10
    const resetPut = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozeMinutes: null }),
      }),
      makeContext(),
    );
    expect(resetPut?.status).toBe(200);
    expect(((await resetPut?.json()) as { settings: { snoozeMinutes: number } }).settings.snoozeMinutes).toBe(10);
  });

  it("rejects out-of-range or non-integer snoozeMinutes with 400 without mutating DB", async () => {
    const valid = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snoozeMinutes: 30 }),
      }),
      makeContext(),
    );
    expect(valid?.status).toBe(200);

    for (const badVal of [0, -1, 1441, 10.5, "15", "", true, {}]) {
      const res = await handleApiRequest(
        new Request("https://synx.test/api/v1/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snoozeMinutes: badVal }),
        }),
        makeContext(),
      );
      expect(res?.status).toBe(400);
    }

    const row = await workerEnv.DB.prepare("SELECT snooze_minutes FROM user_settings WHERE user_id = ?")
      .bind(USER.userId)
      .first<{ snooze_minutes: number | null }>();
    expect(row?.snooze_minutes).toBe(30);
  });
});

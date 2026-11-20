import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ActionFunctionArgs } from "react-router";
import { env } from "cloudflare:test";
import { action as listAction } from "../app/features/list/action.server";
import { action as toggleApiAction } from "../app/routes/api.v1.todos.$id.toggle";
import { listActivityForOwner } from "../app/list-activity.server";
import { TodoManager } from "../app/to-do-manager";
import {
  computeWebQuickAddState,
  formatLocalBaseDay,
} from "../app/features/list/quick-add-form";

const OWNER_ID = "owner-quick-add-test";

vi.mock("../app/auth.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../app/auth.server")>();
  return {
    ...actual,
    verifyBearerToken: vi.fn(async () => ({
      userId: OWNER_ID,
      email: "owner@example.com",
      token: "test-token",
    })),
  };
});

// 2026-11-16 10:00:00 UTC (same wall clock as UTC timezone)
const NOV_16_10AM_UTC = Date.UTC(2026, 10, 16, 10, 0, 0, 0);

describe("web quick add form helper (#101)", () => {
  it("parses date, recurrence, duration, and priority cleanly with dismissible chips", () => {
    const state = computeWebQuickAddState({
      text: "Pay rent tomorrow at 3pm weekly for 20m !high",
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualDuration: undefined,
      manualReminderActive: false,
    });

    expect(state.effectiveTitle).toBe("Pay rent");
    expect(state.effectivePriority).toBe("high");
    expect(state.effectiveRecurrence).toBe("weekly");
    expect(state.effectiveDurationMinutes).toBe(20);
    expect(state.parsedReminderAt).toBe(Date.UTC(2026, 10, 17, 15, 0, 0, 0));
    expect(state.chips.map((c) => c.kind)).toEqual([
      "date",
      "recurrence",
      "duration",
      "priority",
    ]);
  });

  it("supports calendar baseDay anchoring and explicit date overrides", () => {
    const timeOnly = computeWebQuickAddState({
      text: "2pm standup",
      now: NOV_16_10AM_UTC,
      baseDay: "2026-11-18",
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualDuration: undefined,
      manualReminderActive: false,
    });

    expect(timeOnly.effectiveTitle).toBe("standup");
    expect(timeOnly.parsedReminderAt).toBe(Date.UTC(2026, 10, 18, 14, 0, 0, 0));

    const explicitDay = computeWebQuickAddState({
      text: "tomorrow 10am Dentist",
      now: NOV_16_10AM_UTC,
      baseDay: "2026-11-18",
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualDuration: undefined,
      manualReminderActive: false,
    });

    expect(explicitDay.effectiveTitle).toBe("Dentist");
    expect(explicitDay.parsedReminderAt).toBe(Date.UTC(2026, 10, 17, 10, 0, 0, 0));
  });

  it("lets manual priority, duration, explicit clear, and reminder overrides win and hides superseded chips", () => {
    const overridden = computeWebQuickAddState({
      text: "Call Mom tomorrow 9am daily for 30m !high",
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: "low",
      manualDuration: 45,
      manualReminderActive: true,
    });

    expect(overridden.effectiveTitle).toBe("Call Mom");
    expect(overridden.effectivePriority).toBe("low");
    expect(overridden.effectiveRecurrence).toBe("daily");
    expect(overridden.effectiveDurationMinutes).toBe(45);
    expect(overridden.parsedReminderAt).toBeNull();
    expect(overridden.chips.map((c) => c.kind)).toEqual(["recurrence"]);

    const clearedDuration = computeWebQuickAddState({
      text: "Stretch for 30m",
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualDuration: null,
      manualReminderActive: false,
    });

    expect(clearedDuration.effectiveTitle).toBe("Stretch");
    expect(clearedDuration.effectiveDurationMinutes).toBeNull();
    expect(clearedDuration.chips).toEqual([]);
  });

  it("restores dismissed chip phrases into effectiveTitle", () => {
    const initial = computeWebQuickAddState({
      text: "Review tomorrow !low",
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualDuration: undefined,
      manualReminderActive: false,
    });
    const priorityChip = initial.chips.find((c) => c.kind === "priority");
    expect(priorityChip).toBeDefined();

    const afterDismiss = computeWebQuickAddState({
      text: "Review tomorrow !low",
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [priorityChip!.dismissToken],
      manualPriority: null,
      manualDuration: undefined,
      manualReminderActive: false,
    });

    expect(afterDismiss.effectiveTitle).toBe("Review !low");
    expect(afterDismiss.effectivePriority).toBe("none");
    expect(afterDismiss.chips.map((c) => c.kind)).toEqual(["date"]);
  });

  it("suppresses reminder/recurrence chips when canSetReminders is false and skips all parsing when disabled", () => {
    const noReminders = computeWebQuickAddState({
      text: "Sync tomorrow 9am weekly for 15m !med",
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualDuration: undefined,
      manualReminderActive: false,
      canSetReminders: false,
    });

    expect(noReminders.parsedReminderAt).toBeNull();
    expect(noReminders.effectiveRecurrence).toBe("none");
    expect(noReminders.effectivePriority).toBe("medium");
    expect(noReminders.effectiveDurationMinutes).toBe(15);
    expect(noReminders.chips.map((c) => c.kind)).toEqual(["duration", "priority"]);

    const disabled = computeWebQuickAddState({
      text: "Sync tomorrow 9am weekly for 15m !med",
      smartEnabled: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualDuration: undefined,
      manualReminderActive: false,
    });

    expect(disabled.effectiveTitle).toBe("Sync tomorrow 9am weekly for 15m !med");
    expect(disabled.parsedReminderAt).toBeNull();
    expect(disabled.effectivePriority).toBe("none");
    expect(disabled.effectiveDurationMinutes).toBeNull();
    expect(disabled.chips).toEqual([]);
  });

  it("formats local calendar dates into YYYY-MM-DD", () => {
    expect(formatLocalBaseDay(new Date(2026, 10, 5, 14, 30))).toBe("2026-11-05");
  });
});

describe("repeating-task toggle activity log (#101)", () => {
  let db: D1Database;

  beforeEach(() => {
    db = env.DB;
  });

  afterEach(async () => {
    await db.exec("DELETE FROM list_activity");
    await db.exec("DELETE FROM task_completions");
    await db.exec("DELETE FROM todos");
    await db.exec("DELETE FROM lists");
    await db.exec("DELETE FROM user_settings");
  });

  it("logs task_completed for web toggle intent and REST toggle API when rescheduling a repeating task", async () => {
    const listId = `list-repeat-log-${crypto.randomUUID()}`;
    await db
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)")
      .bind(listId, "Shared Repeat List", OWNER_ID, Date.now(), "public_edit")
      .run();

    const manager = new TodoManager(db, listId);
    const created = await manager.create(
      "Daily standup",
      "medium",
      Date.now() + 3_600_000,
      undefined,
      "daily",
      15,
      OWNER_ID,
      OWNER_ID
    );

    const pending: Promise<unknown>[] = [];
    const waitUntil = (p: Promise<unknown>) => {
      pending.push(p);
    };

    // 1. Web list action toggle intent
    const formData = new FormData();
    formData.set("intent", "toggle");
    formData.set("id", created.id);
    const webRes = await listAction({
      request: new Request(`http://localhost/${listId}`, {
        method: "POST",
        headers: {
          Cookie: `synx_auth_session=e2e_test_session:${OWNER_ID}:owner@example.com`,
        },
        body: formData,
      }),
      params: { id: listId },
      context: { cloudflare: { env: { ...env, ALLOW_DEV_TEST_AUTH: "true" }, ctx: { waitUntil } } },
    } as unknown as ActionFunctionArgs);
    const webPayload = (
      webRes instanceof Response ? await webRes.json() : webRes
    ) as { success: boolean; todo: { completed: boolean; rescheduled?: boolean } };
    expect(webPayload.success).toBe(true);
    expect(webPayload.todo.rescheduled).toBe(true);

    // 2. REST API /api/v1/todos/:id/toggle
    const apiRes = await toggleApiAction({
      request: new Request(`http://localhost/api/v1/todos/${created.id}/toggle`, {
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
      }),
      params: { id: created.id },
      context: { cloudflare: { env: { ...env, ALLOW_DEV_TEST_AUTH: "true" }, ctx: { waitUntil } } },
    } as unknown as Parameters<typeof toggleApiAction>[0]);
    expect(apiRes.status).toBe(200);
    const apiPayload = (await apiRes.json()) as {
      todo: { completed: boolean; rescheduled?: boolean };
    };
    expect(apiPayload.todo.rescheduled).toBe(true);

    await Promise.all(pending);

    const activity = await listActivityForOwner(db, listId, OWNER_ID);
    expect(activity.kind).toBe("ok");
    if (activity.kind !== "ok") return;
    expect(activity.entries).toHaveLength(2);
    expect(activity.entries.every((e) => e.action === "task_completed")).toBe(true);
  });
});

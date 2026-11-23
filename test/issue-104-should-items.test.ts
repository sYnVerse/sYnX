import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { formatCompletionsCsv, type CompletionExportRow } from "../shared";
import {
  TodoManager,
  getListCompletionStats,
  getTodoCompletions,
  resolveRestoredReminderSent,
  setCompletionDuration,
} from "../app/to-do-manager";
import { getDueReminderRecipients } from "../app/due-reminders.server";
import { action as listAction } from "../app/features/list/action.server";
import { action as undoRepeatApiAction } from "../app/routes/api.v1.todos.$id.undo-repeat";
import { action as durationApiAction } from "../app/routes/api.v1.completions.$id.duration";
import { loader as completionsExportLoader } from "../app/routes/api.v1.completions.export";

const USER_A = { userId: "user-104-a", email: "a104@example.com" };
const USER_B = { userId: "user-104-b", email: "b104@example.com" };

let currentWebAuth = {
  userId: USER_A.userId,
  email: USER_A.email,
  isLoggedIn: true,
  guestId: null as string | null,
  isNewGuest: false,
  accessToken: "test-token-a" as string | null,
};

let currentApiUser: { userId: string; email: string; token: string } | null = {
  userId: USER_A.userId,
  email: USER_A.email,
  token: "test-token-a",
};

vi.mock("../app/auth-context.server", () => ({
  getRequestWebAuth: vi.fn(async () => currentWebAuth),
  getRequestApiAuth: vi.fn(async () => currentApiUser),
}));

function makeExecutionContext() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

describe("Issue #104 Should items — repeat undo, quick-pick duration, and CSV export", () => {
  beforeEach(() => {
    currentWebAuth = {
      userId: USER_A.userId,
      email: USER_A.email,
      isLoggedIn: true,
      guestId: null,
      isNewGuest: false,
      accessToken: "test-token-a",
    };
    currentApiUser = {
      userId: USER_A.userId,
      email: USER_A.email,
      token: "test-token-a",
    };
  });

  afterEach(async () => {
    await env.DB.exec("DELETE FROM list_activity");
    await env.DB.exec("DELETE FROM pending_delete_requests");
    await env.DB.exec("DELETE FROM task_completions");
    await env.DB.exec("DELETE FROM todos");
    await env.DB.exec("DELETE FROM lists");
    await env.DB.exec("DELETE FROM user_settings");
  });

  it("formats RFC-4180 CSV with formula-injection neutralization and ISO dates", () => {
    const sample: CompletionExportRow[] = [
      {
        id: "comp-1",
        todoId: "todo-1",
        listId: "list-1",
        listName: 'Work, "Urgent"',
        taskText: '=HYPERLINK("http://evil.example","Click")',
        startedAt: Date.UTC(2026, 10, 20, 12, 0, 0),
        completedAt: Date.UTC(2026, 10, 20, 12, 30, 0),
        durationSeconds: 1800,
        estimatedMinutes: 25,
        timeZone: "America/Los_Angeles",
        source: "web",
      },
      {
        id: "comp-2",
        todoId: "todo-2",
        listId: "list-1",
        listName: "+PlusList",
        taskText: "-1 + 1\nnext line",
        startedAt: null,
        completedAt: Date.UTC(2026, 10, 20, 14, 0, 0),
        durationSeconds: null,
        estimatedMinutes: null,
        timeZone: null,
        source: "app",
      },
    ];

    const csv = formatCompletionsCsv(sample);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "id,todo_id,list_id,list_name,task_text,started_at,completed_at,duration_seconds,estimated_minutes,time_zone,source"
    );
    expect(lines[1]).toBe(
      'comp-1,todo-1,list-1,"Work, ""Urgent""","\'=HYPERLINK(""http://evil.example"",""Click"")",2026-11-20T12:00:00.000Z,2026-11-20T12:30:00.000Z,1800,25,America/Los_Angeles,web'
    );
    expect(csv).toContain("'+PlusList,\"'-1 + 1\nnext line\",,2026-11-20T14:00:00.000Z,,,,app\r\n");
  });

  it("resolves restored reminder_sent using previous_reminder_sent or elapsed fallback", () => {
    const now = 1_700_000_000_000;
    expect(resolveRestoredReminderSent(now - 60_000, 0, now)).toBe(0);
    expect(resolveRestoredReminderSent(now + 60_000, 1, now)).toBe(1);
    expect(resolveRestoredReminderSent(now - 60_000, null, now)).toBe(1);
    expect(resolveRestoredReminderSent(now, undefined, now)).toBe(1);
    expect(resolveRestoredReminderSent(now + 60_000, null, now)).toBe(0);
    expect(resolveRestoredReminderSent(null, null, now)).toBe(0);
  });

  it("undoes repeat completions cleanly without re-firing already-sent reminders", async () => {
    const now = Date.now();
    const listId = `list-repeat-undo-${crypto.randomUUID()}`;
    const originalReminder = now - 5 * 60_000;
    await env.DB
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'private')")
      .bind(listId, "Daily Chores", USER_A.userId, now - 3600_000)
      .run();
    await env.DB
      .prepare("INSERT INTO user_settings (user_id, email, email_enabled, time_zone) VALUES (?, ?, 1, 'UTC')")
      .bind(USER_A.userId, USER_A.email)
      .run();

    const manager = new TodoManager(env.DB, listId);
    const created = await manager.create(
      "Take vitamins",
      "high",
      originalReminder,
      undefined,
      "daily",
      15,
      USER_A.userId,
      USER_A.userId
    );
    // Simulate cron already sent the reminder before user checked it off
    await manager.markReminderSent(created.id);
    const startedAt = now - 10 * 60_000;
    await manager.startTodo(created.id, USER_A.userId, startedAt);

    const completed = await manager.setCompleted(created.id, true, {
      timeZone: "UTC",
      userId: USER_A.userId,
      source: "app",
    });
    expect(completed.rescheduled).toBe(true);
    expect(completed.todo.reminderAt).toBeGreaterThan(originalReminder);
    expect(completed.todo.reminderSent).toBe(false);
    expect(completed.completion?.id).toBeTruthy();

    // Undo via mobile/API POST /api/v1/todos/:id/undo-repeat
    const undoRes = await undoRepeatApiAction({
      request: new Request(`http://localhost/api/v1/todos/${created.id}/undo-repeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token-a" },
        body: JSON.stringify({ completionId: completed.completion!.id }),
      }),
      params: { id: created.id },
      context: { cloudflare: { env, ctx: makeExecutionContext() } },
    } as unknown as Parameters<typeof undoRepeatApiAction>[0]);
    expect(undoRes.status).toBe(200);
    const undoJson = (await undoRes.json()) as {
      success: boolean;
      undone: boolean;
      todo: { reminderAt?: number; reminderSent?: boolean; startedAt?: number };
    };
    expect(undoJson.undone).toBe(true);
    expect(undoJson.todo.reminderAt).toBe(originalReminder);
    expect(undoJson.todo.reminderSent).toBe(true);
    expect(undoJson.todo.startedAt).toBe(startedAt);

    // Every-minute cron MUST NOT pick it up again!
    const dueAfterUndo = await getDueReminderRecipients(env.DB, now + 60_000);
    expect(dueAfterUndo.some((r) => r.id === created.id)).toBe(false);

    // Double undo with same completionId is a safe idempotent no-op
    const secondUndoRes = await undoRepeatApiAction({
      request: new Request(`http://localhost/api/v1/todos/${created.id}/undo-repeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token-a" },
        body: JSON.stringify({ completionId: completed.completion!.id }),
      }),
      params: { id: created.id },
      context: { cloudflare: { env, ctx: makeExecutionContext() } },
    } as unknown as Parameters<typeof undoRepeatApiAction>[0]);
    const secondJson = (await secondUndoRes.json()) as { undone: boolean };
    expect(secondJson.undone).toBe(false);

    // Legacy log row missing previous_reminder_sent: past reminder -> 1, future reminder -> 0
    const futureReminder = now + 2 * 3600_000;
    const futureTask = await manager.create(
      "Evening walk",
      "none",
      futureReminder,
      undefined,
      "daily",
      undefined,
      USER_A.userId,
      USER_A.userId
    );
    await env.DB
      .prepare("UPDATE todos SET reminder_at = ? WHERE id = ?")
      .bind(now + 26 * 3600_000, futureTask.id)
      .run();
    await env.DB
      .prepare(
        `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, completed_at, reminder_at, previous_reminder_sent, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'web')`
      )
      .bind("c-legacy-past", created.id, listId, created.text, USER_A.userId, now - 1000, originalReminder)
      .run();
    const pastFallback = await manager.undoRepeatCompletion(created.id, {
      completionId: "c-legacy-past",
      userId: USER_A.userId,
      now,
    });
    expect(pastFallback.todo.reminderSent).toBe(true);
    expect(await getDueReminderRecipients(env.DB, now + 60_000)).toEqual([]);

    await env.DB
      .prepare(
        `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, completed_at, reminder_at, previous_reminder_sent, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'web')`
      )
      .bind("c-legacy-future", futureTask.id, listId, futureTask.text, USER_A.userId, now - 1000, futureReminder)
      .run();
    const futureFallback = await manager.undoRepeatCompletion(futureTask.id, {
      completionId: "c-legacy-future",
      userId: USER_A.userId,
      now,
    });
    expect(futureFallback.todo.reminderAt).toBe(futureReminder);
    expect(futureFallback.todo.reminderSent).toBe(false);

    // Web action intent=undoRepeat works as well
    await manager.setCompleted(futureTask.id, true, { userId: USER_A.userId, source: "web" });
    const webForm = new FormData();
    webForm.set("intent", "undoRepeat");
    webForm.set("id", futureTask.id);
    const webUndo = (await listAction({
      request: new Request(`https://synx.christran.io/${listId}`, { method: "POST", body: webForm }),
      params: { id: listId },
      context: { cloudflare: { env, ctx: makeExecutionContext() } },
    } as unknown as Parameters<typeof listAction>[0])) as { success: boolean; undone: boolean };
    expect(webUndo.success).toBe(true);
    expect(webUndo.undone).toBe(true);
  });

  it("logs quick-pick duration for untimed completions and exports user-scoped CSV", async () => {
    const now = Date.now();
    const listId = `list-quick-csv-${crypto.randomUUID()}`;
    await env.DB
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'public_edit')")
      .bind(listId, "Shared Project", USER_A.userId, now - 10_000)
      .run();

    const manager = new TodoManager(env.DB, listId);
    const tUntimed = await manager.create("Untimed task", "medium", undefined, undefined, "none", 20, USER_A.userId, USER_A.userId);
    const tFormula = await manager.create("=CMD('calc')", "none", undefined, undefined, "none", null, USER_A.userId, USER_A.userId);
    const tOtherUser = await manager.create("Collaborator task", "none", undefined, undefined, "none", null, USER_B.userId, USER_B.userId);

    const cUntimed = await manager.setCompleted(tUntimed.id, true, { userId: USER_A.userId, source: "web" });
    expect(cUntimed.completion?.durationSeconds).toBeNull();

    // Quick pick via API route POST /api/v1/completions/:id/duration (30m)
    const durRes = await durationApiAction({
      request: new Request(`http://localhost/api/v1/completions/${cUntimed.completion!.id}/duration`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token-a" },
        body: JSON.stringify({ durationMinutes: 30 }),
      }),
      params: { id: cUntimed.completion!.id },
      context: { cloudflare: { env } },
    } as unknown as Parameters<typeof durationApiAction>[0]);
    expect(durRes.status).toBe(200);
    const durJson = (await durRes.json()) as { success: boolean; completion: { durationSeconds: number } };
    expect(durJson.completion.durationSeconds).toBe(1800);

    // Already timed -> second quick-pick is rejected (404)
    const alreadyTimedRes = await durationApiAction({
      request: new Request(`http://localhost/api/v1/completions/${cUntimed.completion!.id}/duration`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token-a" },
        body: JSON.stringify({ durationMinutes: 15 }),
      }),
      params: { id: cUntimed.completion!.id },
      context: { cloudflare: { env } },
    } as unknown as Parameters<typeof durationApiAction>[0]);
    expect(alreadyTimedRes.status).toBe(404);

    // Stats & completion query immediately reflect 30m
    const listStats = await getListCompletionStats(env.DB, listId, USER_A.userId);
    expect(listStats[tUntimed.id].lastDurationSeconds).toBe(1800);
    const todoStats = await getTodoCompletions(env.DB, tUntimed.id, listId, USER_A.userId);
    expect(todoStats.entries[0]?.durationSeconds).toBe(1800);

    // Formula task quick pick via web ACCOUNT_INTENTS
    const cFormula = await manager.setCompleted(tFormula.id, true, { userId: USER_A.userId, source: "web" });
    const webForm = new FormData();
    webForm.set("intent", "setCompletionDuration");
    webForm.set("completionId", cFormula.completion!.id);
    webForm.set("durationMinutes", "15");
    const webDurRes = await listAction({
      request: new Request(`https://synx.christran.io/${listId}`, { method: "POST", body: webForm }),
      params: { id: listId },
      context: { cloudflare: { env, ctx: makeExecutionContext() } },
    } as unknown as Parameters<typeof listAction>[0]);
    const webDurJson =
      webDurRes instanceof Response
        ? ((await webDurRes.json()) as { success: boolean; completion: { durationSeconds: number } })
        : (webDurRes as { success: boolean; completion: { durationSeconds: number } });
    expect(webDurJson.success).toBe(true);
    expect(webDurJson.completion.durationSeconds).toBe(900);

    // Voided task completion rejected
    await manager.setCompleted(tFormula.id, false, { userId: USER_A.userId, source: "web" });
    expect(await setCompletionDuration(env.DB, cFormula.completion!.id, USER_A.userId, 15)).toBeNull();

    // Another user (USER_B) completes a task on the same shared list -> must not leak into USER_A export
    const cOther = await manager.setCompleted(tOtherUser.id, true, { userId: USER_B.userId, source: "app" });
    expect(
      await setCompletionDuration(env.DB, cOther.completion!.id, USER_A.userId, 60)
    ).toBeNull();

    // Add a non-voided formula task for USER_A to verify CSV formula neutralization
    const tFormulaKept = await manager.create("=2+2", "none", undefined, undefined, "none", null, USER_A.userId, USER_A.userId);
    await manager.setCompleted(tFormulaKept.id, true, { userId: USER_A.userId, source: "web" });

    // Unauthenticated export returns 401
    currentApiUser = null;
    const unauthExport = await completionsExportLoader({
      request: new Request("http://localhost/api/v1/completions/export"),
      params: {},
      context: { cloudflare: { env } },
    } as unknown as Parameters<typeof completionsExportLoader>[0]);
    expect(unauthExport.status).toBe(401);

    // Authenticated USER_A export returns only USER_A non-voided entries
    currentApiUser = { userId: USER_A.userId, email: USER_A.email, token: "test-token-a" };
    const exportRes = await completionsExportLoader({
      request: new Request("http://localhost/api/v1/completions/export"),
      params: {},
      context: { cloudflare: { env } },
    } as unknown as Parameters<typeof completionsExportLoader>[0]);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("Content-Type")).toContain("text/csv");
    expect(exportRes.headers.get("Content-Disposition")).toContain("attachment");
    const csvText = await exportRes.text();
    expect(csvText).toContain("Untimed task");
    expect(csvText).toContain("1800");
    expect(csvText).toContain("'=2+2");
    expect(csvText).not.toContain("=CMD"); // voided when unchecked
    expect(csvText).not.toContain("Collaborator task"); // belongs strictly to USER_B
  });
});

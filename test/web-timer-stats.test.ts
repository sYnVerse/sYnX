import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { MAX_STAT_DURATION_SECONDS, TodoManager, getListCompletionStats, summarizeCompletionDurations, type Todo } from "../app/to-do-manager";
import type { TaskCompletionStats } from "../shared";
import { loader as listLoader } from "../app/features/list/loader.server";
import { action as startApiAction } from "../app/routes/api.v1.todos.$id.start";

const USER_A = { userId: "user-timer-a", email: "a@example.com" };
const USER_B = { userId: "user-timer-b", email: "b@example.com" };

let currentWebAuth = {
  userId: USER_A.userId,
  email: USER_A.email,
  isLoggedIn: true,
  guestId: null as string | null,
  isNewGuest: false,
  accessToken: "test-token" as string | null,
};

let currentApiUser: { userId: string; email: string; token: string } | null = {
  userId: USER_A.userId,
  email: USER_A.email,
  token: "test-token",
};

vi.mock("../app/auth-context.server", () => ({
  getRequestWebAuth: vi.fn(async () => currentWebAuth),
  getRequestApiAuth: vi.fn(async () => currentApiUser),
}));

interface LoaderDataPayload {
  todos: Todo[];
  completionStatsByTodoId: Record<string, TaskCompletionStats>;
}

async function runListLoader(listId: string): Promise<LoaderDataPayload> {
  const result = await listLoader({
    request: new Request(`https://synx.christran.io/${listId}`),
    params: { id: listId },
    context: {
      cloudflare: {
        env: {
          DB: env.DB,
          JWT_SECRET: "test-secret",
        },
      },
    },
  } as unknown as Parameters<typeof listLoader>[0]);
  const unwrapped =
    result && typeof result === "object" && "data" in result
      ? (result as { data: LoaderDataPayload }).data
      : result;
  if (!unwrapped || unwrapped instanceof Response) {
    throw new Error("Expected listLoader to return loader payload rather than Response");
  }
  return unwrapped as LoaderDataPayload;
}

describe("Web timer & completion stats (#103)", () => {
  beforeEach(() => {
    currentWebAuth = {
      userId: USER_A.userId,
      email: USER_A.email,
      isLoggedIn: true,
      guestId: null,
      isNewGuest: false,
      accessToken: "test-token",
    };
    currentApiUser = {
      userId: USER_A.userId,
      email: USER_A.email,
      token: "test-token",
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

  it("summarizes durations cleanly while keeping >12h outliers and untimed completions out of averages/medians", () => {
    expect(summarizeCompletionDurations([])).toEqual({
      count: 0,
      timedCount: 0,
      averageSeconds: null,
      medianSeconds: null,
      lastDurationSeconds: null,
      estimatedMinutes: null,
    });

    // Newest first: >12h outlier (ignored for duration metrics), 600s, null, 300s, 900s
    const outlier = MAX_STAT_DURATION_SECONDS + 1;
    const oddSummary = summarizeCompletionDurations([outlier, 600, null, 300, 900], 15);
    expect(oddSummary).toEqual({
      count: 5,
      timedCount: 3,
      averageSeconds: 600,
      medianSeconds: 600,
      lastDurationSeconds: 600,
      estimatedMinutes: 15,
    });

    // Even count of valid durations: [120, 480, 600, 1200] -> mid mean = (480 + 600)/2 = 540
    const evenSummary = summarizeCompletionDurations([120, 480, 600, 1200], 10);
    expect(evenSummary).toEqual({
      count: 4,
      timedCount: 4,
      averageSeconds: 600,
      medianSeconds: 540,
      lastDurationSeconds: 120,
      estimatedMinutes: 10,
    });
  });

  it("excludes voided and >12h outlier completions and isolates stats strictly per user on shared lists", async () => {
    const listId = `list-stats-${crypto.randomUUID()}`;
    const now = Date.now();
    await env.DB
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'public_edit')")
      .bind(listId, "Shared Timing List", USER_A.userId, now)
      .run();

    const manager = new TodoManager(env.DB, listId);
    const taskA = await manager.create("User A task", "medium", undefined, undefined, "daily", 25, USER_A.userId, USER_A.userId);
    const taskShared = await manager.create("Shared task", "none", undefined, undefined, "none", 30, USER_A.userId, USER_A.userId);

    // Seed completions for taskA: valid 15m (newest), valid 35m (older), voided 99m, and >12h outlier
    await env.DB
      .prepare(
        `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, started_by, started_at, completed_at, duration_seconds, estimated_minutes, source)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web'),
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web'),
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web'),
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web')`
      )
      .bind(
        "c-a-1", taskA.id, listId, taskA.text, USER_A.userId, USER_A.userId, now - 15 * 60_000, now - 1_000, 15 * 60, 25,
        "c-a-2", taskA.id, listId, taskA.text, USER_A.userId, USER_A.userId, now - 90 * 60_000, now - 55 * 60_000, 35 * 60, 25,
        "c-a-outlier", taskA.id, listId, taskA.text, USER_A.userId, USER_A.userId, now - 20 * 3600_000, now - 6 * 3600_000, MAX_STAT_DURATION_SECONDS + 120, 25,
        "c-b-only", taskA.id, listId, taskA.text, USER_B.userId, USER_B.userId, now - 5 * 60_000, now - 2_000, 3 * 60, 25
      )
      .run();

    await env.DB
      .prepare(
        `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, started_by, started_at, completed_at, duration_seconds, estimated_minutes, source, voided_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web', ?)`
      )
      .bind(
        "c-a-voided", taskA.id, listId, taskA.text, USER_A.userId, USER_A.userId, now - 120 * 60_000, now - 21 * 60_000, 99 * 60, 25, now - 10_000
      )
      .run();

    // User A started `taskShared` and User B checked it off -> attribution goes to started_by (User A)
    await env.DB
      .prepare(
        `INSERT INTO task_completions (id, todo_id, list_id, task_text, user_id, started_by, started_at, completed_at, duration_seconds, estimated_minutes, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'web')`
      )
      .bind(
        "c-shared-a-started", taskShared.id, listId, taskShared.text, USER_B.userId, USER_A.userId, now - 18 * 60_000, now - 500, 18 * 60, 30
      )
      .run();

    const statsForA = await getListCompletionStats(env.DB, listId, USER_A.userId);
    expect(statsForA[taskA.id]).toEqual({
      count: 3, // c-a-1, c-a-2, c-a-outlier (voided row excluded completely)
      timedCount: 2, // outlier excluded from timed stats
      averageSeconds: 25 * 60, // (15m + 35m) / 2
      medianSeconds: 25 * 60,
      lastDurationSeconds: 15 * 60,
      estimatedMinutes: 25,
      entries: [],
    });
    expect(statsForA[taskShared.id]).toEqual({
      count: 1,
      timedCount: 1,
      averageSeconds: 18 * 60,
      medianSeconds: 18 * 60,
      lastDurationSeconds: 18 * 60,
      estimatedMinutes: 30,
      entries: [],
    });

    const statsForB = await getListCompletionStats(env.DB, listId, USER_B.userId);
    expect(statsForB[taskA.id]).toEqual({
      count: 1,
      timedCount: 1,
      averageSeconds: 3 * 60,
      medianSeconds: 3 * 60,
      lastDurationSeconds: 3 * 60,
      estimatedMinutes: 25,
      entries: [],
    });
    expect(statsForB[taskShared.id]).toBeUndefined();
  });

  it("exposes mobile/API startedAt + startedBy and caller-scoped completionStatsByTodoId in listLoader", async () => {
    const listId = `list-loader-timer-${crypto.randomUUID()}`;
    const now = Date.now();
    await env.DB
      .prepare("INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, 'public_edit')")
      .bind(listId, "Sync List", USER_A.userId, now)
      .run();

    const manager = new TodoManager(env.DB, listId);
    const activeTask = await manager.create("Mobile started task", "high", undefined, undefined, "none", 20, USER_A.userId, USER_A.userId);
    const completedTask = await manager.create("Finished timed task", "medium", undefined, undefined, "none", 10, USER_A.userId, USER_A.userId);

    // Mobile/API client starts the timer
    const startedAt = now - 5 * 60_000;
    const startResponse = await startApiAction({
      request: new Request(`http://localhost/api/v1/todos/${activeTask.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
        body: JSON.stringify({ startedAt }),
      }),
      params: { id: activeTask.id },
      context: { cloudflare: { env } },
    } as unknown as Parameters<typeof startApiAction>[0]);
    expect(startResponse.status).toBe(200);

    // User A completes `completedTask` after a 12m timer
    await manager.startTodo(completedTask.id, USER_A.userId, now - 12 * 60_000);
    await manager.setCompleted(completedTask.id, true, { userId: USER_A.userId, source: "web" });

    // Load web route as User A -> sees activeTask.startedAt/startedBy & completedTask stats
    const payloadA = await runListLoader(listId);
    const loadedActive = payloadA.todos.find((t) => t.id === activeTask.id);
    expect(loadedActive?.startedAt).toBe(startedAt);
    expect(loadedActive?.startedBy).toBe(USER_A.userId);
    expect(payloadA.completionStatsByTodoId[completedTask.id]).toMatchObject({
      timedCount: 1,
      lastDurationSeconds: 12 * 60,
      estimatedMinutes: 10,
    });

    // Switch to User B -> still sees live timer fields on collaborative task, but NOT User A's private completion stats
    currentWebAuth = {
      userId: USER_B.userId,
      email: USER_B.email,
      isLoggedIn: true,
      guestId: null,
      isNewGuest: false,
      accessToken: "test-token-b",
    };
    const payloadB = await runListLoader(listId);
    const loadedActiveB = payloadB.todos.find((t) => t.id === activeTask.id);
    expect(loadedActiveB?.startedAt).toBe(startedAt);
    expect(payloadB.completionStatsByTodoId[completedTask.id]).toBeUndefined();

    // Unauthenticated guest viewer on shared list sees empty completionStatsByTodoId
    currentWebAuth = {
      userId: "guest_anon_1",
      email: "",
      isLoggedIn: false,
      guestId: "guest_anon_1",
      isNewGuest: false,
      accessToken: null,
    };
    const payloadGuest = await runListLoader(listId);
    expect(payloadGuest.completionStatsByTodoId).toEqual({});
  });
});

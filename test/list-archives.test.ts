import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";
import { env as workerEnv } from "cloudflare:test";
import {
  canArchiveList,
  clearArchivePromptDismissed,
  countListTasks,
  describeListActivityAction,
  isListCompleted,
  isListSummaryCompleted,
  markArchivePromptDismissed,
  parseDismissedArchivePrompts,
  serializeDismissedArchivePrompts,
  shouldSuggestArchivingList,
} from "../shared";
import { handleApiRequest } from "../backend/api/router";
import { cloudflareContext } from "../backend/services/context.server";
import * as authContext from "../backend/services/auth-context.server";
import { TodoManager } from "../backend/services/to-do-manager";
import {
  getDueReminderRecipients,
  suppressDueRemindersForArchivedRecipients,
} from "../backend/services/due-reminders.server";
import { action as listAction } from "../web/app/features/list/action.server";
import { loader as listLoader } from "../web/app/features/list/loader.server";

const OWNER = { userId: "archive-owner", email: "owner-arch@example.com" };
const COLLAB = { userId: "archive-collab", email: "collab-arch@example.com" };
const OUTSIDER = { userId: "archive-outsider", email: "outsider-arch@example.com" };

let currentWebAuth = {
  userId: OWNER.userId,
  email: OWNER.email,
  isLoggedIn: true,
  guestId: null as string | null,
  isNewGuest: false,
  accessToken: "token-owner" as string | null,
};

let currentApiUser: { userId: string; email: string; token: string } | null = {
  userId: OWNER.userId,
  email: OWNER.email,
  token: "token-owner",
};

function makeContext(envOverrides: Record<string, unknown> = {}): RouterContextProvider {
  const provider = new RouterContextProvider();
  provider.set(cloudflareContext, {
    env: { DB: workerEnv.DB, ...envOverrides } as unknown as Env,
    ctx: { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext,
  });
  return provider;
}

describe("Issue #230 shared archive helpers & permissions", () => {
  it("evaluates canArchiveList correctly for signed-in owners, shared viewers, and guests", () => {
    expect(canArchiveList({ isLoggedIn: false, isOwner: true, hasSharedAccess: false })).toBe(false);
    expect(canArchiveList({ isLoggedIn: true, isOwner: true, hasSharedAccess: false })).toBe(true);
    expect(canArchiveList({ isLoggedIn: true, isOwner: false, hasSharedAccess: true })).toBe(true);
    expect(canArchiveList({ isLoggedIn: true, isOwner: false, hasSharedAccess: false })).toBe(false);
  });

  it("counts flat and nested tasks without double counting", () => {
    const nested = [
      {
        id: "p1",
        completed: true,
        subtasks: [
          { id: "s1", completed: true },
          { id: "s2", completed: false },
        ],
      },
      { id: "s1", completed: true },
    ];
    expect(countListTasks(nested)).toEqual({ total: 3, open: 1 });
    expect(isListCompleted(nested)).toBe(false);
    expect(
      isListCompleted([
        { id: "p1", completed: true, subtasks: [{ id: "s1", completed: true }] },
      ]),
    ).toBe(true);
    expect(isListCompleted([])).toBe(false);
  });

  it("checks list summary completion fields accurately", () => {
    expect(isListSummaryCompleted({ totalTaskCount: 0, allTasksCompleted: true })).toBe(false);
    expect(isListSummaryCompleted({ totalTaskCount: 3, allTasksCompleted: true })).toBe(true);
    expect(isListSummaryCompleted({ totalTaskCount: 3, openTaskCount: 1, openSubtaskCount: 0 })).toBe(false);
    expect(isListSummaryCompleted({ totalTaskCount: 2, openTaskCount: 0, openSubtaskCount: 1 })).toBe(false);
    expect(isListSummaryCompleted({ totalTaskCount: 2, openTaskCount: 0, openSubtaskCount: 0 })).toBe(true);
  });

  it("suggests archiving only on false->true completion transitions", () => {
    expect(
      shouldSuggestArchivingList({
        wasCompleted: false,
        isNowCompleted: true,
        isArchived: false,
        canArchive: true,
        suggestionsEnabled: true,
        dismissedForCycle: false,
      }),
    ).toBe(true);
    expect(
      shouldSuggestArchivingList({
        wasCompleted: true,
        isNowCompleted: true,
        isArchived: false,
        canArchive: true,
        suggestionsEnabled: true,
        dismissedForCycle: false,
      }),
    ).toBe(false);
    expect(
      shouldSuggestArchivingList({
        wasCompleted: false,
        isNowCompleted: true,
        isArchived: false,
        canArchive: true,
        suggestionsEnabled: false,
        dismissedForCycle: false,
      }),
    ).toBe(false);
    expect(
      shouldSuggestArchivingList({
        wasCompleted: false,
        isNowCompleted: true,
        isArchived: false,
        canArchive: true,
        suggestionsEnabled: true,
        dismissedForCycle: true,
      }),
    ).toBe(false);
  });

  it("manages dismissed archive prompt storage sets and activity labels", () => {
    const initial = parseDismissedArchivePrompts("invalid");
    expect(initial.size).toBe(0);
    const added = markArchivePromptDismissed(initial, "list-a");
    expect(parseDismissedArchivePrompts(serializeDismissedArchivePrompts(added)).has("list-a")).toBe(true);
    const cleared = clearArchivePromptDismissed(added, "list-a");
    expect(cleared.has("list-a")).toBe(false);
    expect(describeListActivityAction("list_archived")).toBe("Archived the list");
    expect(describeListActivityAction("list_unarchived")).toBe("Unarchived the list");
  });
});

describe("Issue #230 list archives D1 API, reminders cron, settings & web actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    currentWebAuth = {
      userId: OWNER.userId,
      email: OWNER.email,
      isLoggedIn: true,
      guestId: null,
      isNewGuest: false,
      accessToken: "token-owner",
    };
    currentApiUser = {
      userId: OWNER.userId,
      email: OWNER.email,
      token: "token-owner",
    };
    vi.spyOn(authContext, "getRequestWebAuth").mockImplementation(async () => currentWebAuth);
    vi.spyOn(authContext, "getRequestApiAuth").mockImplementation(async () => currentApiUser);
  });

  afterEach(async () => {
    await workerEnv.DB.exec("DELETE FROM list_archives");
    await workerEnv.DB.exec("DELETE FROM shared_list_access");
    await workerEnv.DB.exec("DELETE FROM list_activity");
    await workerEnv.DB.exec("DELETE FROM task_completions");
    await workerEnv.DB.exec("DELETE FROM todos");
    await workerEnv.DB.exec("DELETE FROM lists");
    await workerEnv.DB.exec("DELETE FROM user_settings");
  });

  it("enforces auth and share permissions on archive/unarchive API and preserves per-user isolation", async () => {
    const now = Date.now();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("priv-1", "Private List", OWNER.userId, now - 3000, "private").run();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("shared-read-1", "Shared Read", OWNER.userId, now - 2000, "public_read").run();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("shared-edit-1", "Shared Edit", OWNER.userId, now - 1000, "public_edit").run();

    // Unauthenticated -> 401
    currentApiUser = null;
    const unauthRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists/priv-1/archive", { method: "POST" }),
      makeContext(),
    );
    expect(unauthRes?.status).toBe(401);

    // Outsider cannot archive private list -> 403
    currentApiUser = { userId: OUTSIDER.userId, email: OUTSIDER.email, token: "tok-out" };
    const forbiddenRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists/priv-1/archive", { method: "POST" }),
      makeContext(),
    );
    expect(forbiddenRes?.status).toBe(403);

    // Signed-in collaborator CAN archive public_read & public_edit lists
    currentApiUser = { userId: COLLAB.userId, email: COLLAB.email, token: "tok-collab" };
    const archRead = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists/shared-read-1/archive", { method: "POST" }),
      makeContext(),
    );
    expect(archRead?.status).toBe(200);
    const archReadJson = (await archRead?.json()) as { archived: boolean; archivedAt: number };
    expect(archReadJson.archived).toBe(true);
    expect(archReadJson.archivedAt).toBeGreaterThan(0);

    // Collaborator has shared_list_access recorded so archived=only lists include shared-read-1
    const collabArchivedRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists?scope=all&archived=only"),
      makeContext(),
    );
    expect(collabArchivedRes?.status).toBe(200);
    const collabArchivedJson = (await collabArchivedRes?.json()) as {
      lists: Array<{ id: string; isArchived?: boolean }>;
    };
    expect(collabArchivedJson.lists.map((l) => l.id)).toEqual(["shared-read-1"]);
    expect(collabArchivedJson.lists[0].isArchived).toBe(true);

    // Active lists for collaborator exclude shared-read-1
    const collabActiveRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists?scope=all"),
      makeContext(),
    );
    const collabActiveJson = (await collabActiveRes?.json()) as { lists: Array<{ id: string }> };
    expect(collabActiveJson.lists.map((l) => l.id)).not.toContain("shared-read-1");

    // Owner STILL sees shared-read-1 as active because archive state is per-user!
    currentApiUser = { userId: OWNER.userId, email: OWNER.email, token: "token-owner" };
    const ownerActiveRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists?scope=all"),
      makeContext(),
    );
    const ownerActiveJson = (await ownerActiveRes?.json()) as {
      lists: Array<{ id: string; isArchived?: boolean }>;
    };
    const sharedForOwner = ownerActiveJson.lists.find((l) => l.id === "shared-read-1");
    expect(sharedForOwner).toBeDefined();
    expect(sharedForOwner?.isArchived).toBe(false);
  });

  it("returns summary completion counts, sorts archived=only by archived_at DESC, and auto-unarchives only for actor on task add", async () => {
    const now = Date.now();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("l1", "First Done", OWNER.userId, now - 5000, "public_edit").run();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("l2", "Second Done", OWNER.userId, now - 4000, "private").run();

    const m1 = new TodoManager(workerEnv.DB, "l1");
    const t1 = await m1.create("Task 1", "none", undefined, undefined, "none", null, OWNER.userId);
    await m1.setCompleted(t1.id, true, { userId: OWNER.userId, source: "api" });

    // Summary shows allTasksCompleted: true
    const summaryRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists?scope=all"),
      makeContext(),
    );
    const summaryJson = (await summaryRes?.json()) as {
      lists: Array<{ id: string; totalTaskCount: number; allTasksCompleted: boolean }>;
    };
    const l1Summary = summaryJson.lists.find((l) => l.id === "l1");
    expect(l1Summary?.totalTaskCount).toBe(1);
    expect(l1Summary?.allTasksCompleted).toBe(true);
    const l2Summary = summaryJson.lists.find((l) => l.id === "l2");
    expect(l2Summary?.totalTaskCount).toBe(0);
    expect(l2Summary?.allTasksCompleted).toBe(false);

    // Archive l1 then l2 at distinct timestamps
    await workerEnv.DB.prepare(
      "INSERT INTO list_archives (user_id, list_id, archived_at) VALUES (?, ?, ?)"
    ).bind(OWNER.userId, "l1", 1000).run();
    await workerEnv.DB.prepare(
      "INSERT INTO list_archives (user_id, list_id, archived_at) VALUES (?, ?, ?)"
    ).bind(OWNER.userId, "l2", 2000).run();
    await workerEnv.DB.prepare(
      "INSERT INTO list_archives (user_id, list_id, archived_at) VALUES (?, ?, ?)"
    ).bind(COLLAB.userId, "l1", 1500).run();

    const archivedOnlyRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/lists?archived=only"),
      makeContext(),
    );
    const archivedOnlyJson = (await archivedOnlyRes?.json()) as { lists: Array<{ id: string }> };
    expect(archivedOnlyJson.lists.map((l) => l.id)).toEqual(["l2", "l1"]);

    // Adding a task to l1 by OWNER auto-unarchives l1 for OWNER, logs activity, leaves COLLAB archived!
    const addTaskRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId: "l1", text: "New task reopens list" }),
      }),
      makeContext(),
    );
    expect(addTaskRes?.status).toBe(201);
    const addTaskJson = (await addTaskRes?.json()) as { unarchivedList?: boolean };
    expect(addTaskJson.unarchivedList).toBe(true);

    const ownerRow = await workerEnv.DB.prepare(
      "SELECT 1 FROM list_archives WHERE user_id = ? AND list_id = ?"
    ).bind(OWNER.userId, "l1").first();
    expect(ownerRow).toBeNull();

    const collabRow = await workerEnv.DB.prepare(
      "SELECT 1 FROM list_archives WHERE user_id = ? AND list_id = ?"
    ).bind(COLLAB.userId, "l1").first();
    expect(collabRow).not.toBeNull();

    const actRow = await workerEnv.DB.prepare(
      "SELECT action FROM list_activity WHERE list_id = ? AND action = 'list_unarchived'"
    ).bind("l1").first<{ action: string }>();
    expect(actRow?.action).toBe("list_unarchived");
  });

  it("suppresses and marks sent reminders due while archived without blocking active collaborators or post-unarchive reminders", async () => {
    const now = 2_000_000_000_000;
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("rem-list", "Shared Reminders", OWNER.userId, now - 10_000, "public_edit").run();
    await workerEnv.DB.prepare(
      "INSERT INTO user_settings (user_id, email, email_enabled) VALUES (?, ?, 1), (?, ?, 1)"
    ).bind(OWNER.userId, OWNER.email, COLLAB.userId, COLLAB.email).run();

    // OWNER archived the list, COLLAB did not
    await workerEnv.DB.prepare(
      "INSERT INTO list_archives (user_id, list_id, archived_at) VALUES (?, ?, ?)"
    ).bind(OWNER.userId, "rem-list", now - 5_000).run();

    const mgr = new TodoManager(workerEnv.DB, "rem-list");
    const ownerDue = await mgr.create("Owner due task", "none", now - 1_000, undefined, "none", null, OWNER.userId, OWNER.userId);
    const ownerFuture = await mgr.create("Owner future task", "none", now + 60_000, undefined, "none", null, OWNER.userId, OWNER.userId);
    const collabDue = await mgr.create("Collab due task", "none", now - 500, undefined, "none", null, COLLAB.userId, COLLAB.userId);

    const suppressed = await suppressDueRemindersForArchivedRecipients(workerEnv.DB, now);
    expect(suppressed).toBe(1);

    const dueRecipients = await getDueReminderRecipients(workerEnv.DB, now);
    expect(dueRecipients.map((r) => r.id)).toEqual([collabDue.id]);

    // Later OWNER unarchives the list -> ownerDue stays reminder_sent=1 (no late send), ownerFuture fires when due!
    await workerEnv.DB.prepare(
      "DELETE FROM list_archives WHERE user_id = ? AND list_id = ?"
    ).bind(OWNER.userId, "rem-list").run();

    const ownerDueRow = await workerEnv.DB.prepare(
      "SELECT reminder_sent FROM todos WHERE id = ?"
    ).bind(ownerDue.id).first<{ reminder_sent: number }>();
    expect(ownerDueRow?.reminder_sent).toBe(1);

    // Resetting collabDue so only ownerFuture is evaluated at now + 65_000
    await workerEnv.DB.prepare("UPDATE todos SET reminder_sent = 1 WHERE id = ?").bind(collabDue.id).run();
    const afterUnarchive = await getDueReminderRecipients(workerEnv.DB, now + 65_000);
    expect(afterUnarchive.map((r) => r.id)).toEqual([ownerFuture.id]);
  });

  it("persists archiveSuggestionsEnabled in settings API and preserves existing settings on partial PUT", async () => {
    // Enable email notifications first
    const putNotif = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailEnabled: true,
          smsEnabled: false,
          phoneNumber: "",
          phoneCarrier: "",
          discordWebhookUrl: "",
        }),
      }),
      makeContext(),
    );
    expect(putNotif?.status).toBe(200);

    // Partial PUT updating only archiveSuggestionsEnabled
    const putPref = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveSuggestionsEnabled: false }),
      }),
      makeContext(),
    );
    expect(putPref?.status).toBe(200);
    const putPrefJson = (await putPref?.json()) as {
      settings: { emailEnabled: boolean; archiveSuggestionsEnabled: boolean };
    };
    expect(putPrefJson.settings.emailEnabled).toBe(true);
    expect(putPrefJson.settings.archiveSuggestionsEnabled).toBe(false);

    // Notification-only PUT afterward must NOT reset archive_suggestions_enabled to true
    const putNotif2 = await handleApiRequest(
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
    expect(putNotif2?.status).toBe(200);

    const getRes = await handleApiRequest(
      new Request("https://synx.test/api/v1/settings"),
      makeContext(),
    );
    const getJson = (await getRes?.json()) as {
      settings: { emailEnabled: boolean; archiveSuggestionsEnabled: boolean };
    };
    expect(getJson.settings.emailEnabled).toBe(false);
    expect(getJson.settings.archiveSuggestionsEnabled).toBe(false);
  });

  it("handles web loader archived_at, setArchiveSuggestions, archiveList redirect, and create auto-unarchive", async () => {
    const now = Date.now();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("web-1", "Active One", OWNER.userId, now - 2000, "private").run();
    await workerEnv.DB.prepare(
      "INSERT INTO lists (id, name, owner_id, created_at, share_mode) VALUES (?, ?, ?, ?, ?)"
    ).bind("web-2", "To Archive", OWNER.userId, now - 1000, "private").run();

    // Toggle archive suggestions via web action
    const toggleForm = new FormData();
    toggleForm.set("intent", "setArchiveSuggestions");
    toggleForm.set("enabled", "false");
    const toggleRes = await listAction({
      request: new Request("https://synx.test/web-2", { method: "POST", body: toggleForm }),
      params: { id: "web-2" },
      context: makeContext(),
    } as unknown as Parameters<typeof listAction>[0]);
    expect((toggleRes as Response).status).toBe(200);

    // Archive active web-2 -> redirects to non-archived web-1
    const archForm = new FormData();
    archForm.set("intent", "archiveList");
    archForm.set("listId", "web-2");
    const archRes = (await listAction({
      request: new Request("https://synx.test/web-2", { method: "POST", body: archForm }),
      params: { id: "web-2" },
      context: makeContext(),
    } as unknown as Parameters<typeof listAction>[0])) as Response;
    expect(archRes.status).toBe(302);
    expect(archRes.headers.get("Location")).toBe("/web-1");

    // Loader returns archived_at and archiveSuggestionsEnabled=false
    const loaded = (await listLoader({
      request: new Request("https://synx.test/web-2"),
      params: { id: "web-2" },
      context: makeContext(),
    } as unknown as Parameters<typeof listLoader>[0])) as {
      settings: { archiveSuggestionsEnabled: boolean };
      lists: Array<{ id: string; archived_at?: number | null }>;
    };
    expect(loaded.settings.archiveSuggestionsEnabled).toBe(false);
    expect(loaded.lists.find((l) => l.id === "web-2")?.archived_at).toBeTruthy();

    // Creating a task on archived web-2 auto-unarchives it
    const createForm = new FormData();
    createForm.set("intent", "create");
    createForm.set("text", "Unarchive via web task");
    const createResult = (await listAction({
      request: new Request("https://synx.test/web-2", { method: "POST", body: createForm }),
      params: { id: "web-2" },
      context: makeContext(),
    } as unknown as Parameters<typeof listAction>[0])) as { success: boolean; unarchivedList: boolean };
    expect(createResult.success).toBe(true);
    expect(createResult.unarchivedList).toBe(true);
  });
});

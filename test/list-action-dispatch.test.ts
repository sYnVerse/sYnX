import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { action } from "../app/features/list/action.server";
import { ACCOUNT_INTENTS, LIST_INTENTS } from "../app/features/list/actions/index.server";
import { checkListAccessGate, type ListAccessInfo } from "../app/features/list/actions/access.server";
import { canDeleteTaskDirectly } from "../shared/list-permissions";

describe("list action dispatch maps", () => {
  const expectedAccountIntents = [
    "listActivity",
    "migrateGuestLists",
    "setTimeZone",
    "initTimeZone",
    "acceptSuggestedDisplayName",
    "dismissSuggestedDisplayName",
    "updateSettings",
    "removeSharedList",
    "approveDeleteRequest",
    "declineDeleteRequest",
  ];

  const expectedListIntents = [
    "create",
    "toggle",
    "setCompleted",
    "delete",
    "clearCompleted",
    "updatePriority",
    "updateText",
    "updateReminder",
    "markReminderSent",
    "updateRecurrence",
    "updateDuration",
    "updateShareMode",
    "createList",
    "renameList",
    "updateListCategory",
    "deleteList",
  ];

  it("pins every intent in ACCOUNT_INTENTS", () => {
    expect(Object.keys(ACCOUNT_INTENTS).sort()).toEqual(expectedAccountIntents.sort());
    for (const key of expectedAccountIntents) {
      expect(typeof ACCOUNT_INTENTS[key]).toBe("function");
    }
  });

  it("pins every intent in LIST_INTENTS", () => {
    expect(Object.keys(LIST_INTENTS).sort()).toEqual(expectedListIntents.sort());
    for (const key of expectedListIntents) {
      expect(typeof LIST_INTENTS[key]).toBe("function");
    }
  });
});

describe("guest access gate", () => {
  const sharedListAccess: ListAccessInfo = {
    hasOwnership: false,
    isCollaborative: true,
    activeShareMode: "public_edit",
    listOwnerId: "owner-123",
  };

  const browserListAccess: ListAccessInfo = {
    hasOwnership: false,
    isCollaborative: false,
    activeShareMode: null,
    listOwnerId: null,
  };

  it("returns 403 on every shared-list write for a guest", async () => {
    for (const intent of Object.keys(LIST_INTENTS)) {
      const res = checkListAccessGate(intent, false, sharedListAccess);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
      const data = await res?.json() as { error: string };
      if (intent === "createList") {
        expect(data.error).toMatch(/save lists to your account/i);
      } else {
        expect(data.error).toBe("Sign in to edit this list.");
      }
    }
  });

  it("returns guestLocalStorage no-op for guest browser lists, except createList", async () => {
    const createRes = checkListAccessGate("createList", false, browserListAccess);
    expect(createRes?.status).toBe(403);

    for (const intent of Object.keys(LIST_INTENTS)) {
      if (intent === "createList") continue;
      const res = checkListAccessGate(intent, false, browserListAccess);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(200);
      const data = await res?.json() as { success: boolean; guestLocalStorage: boolean };
      expect(data).toEqual({ success: true, guestLocalStorage: true });
    }
  });
});

describe("Issue 87 task delete permission rules", () => {
  const tasks = [
    { id: "task-1", createdBy: "user-collab", parentId: undefined },
    { id: "subtask-1", createdBy: "user-collab", parentId: "task-1" },
    { id: "task-2", createdBy: "owner-1", parentId: undefined },
    { id: "task-3", createdBy: "user-collab", parentId: undefined },
    { id: "subtask-3", createdBy: "other-collab", parentId: "task-3" },
  ];

  it("lets owners delete any task directly", () => {
    expect(canDeleteTaskDirectly({ tasks, taskId: "task-2", userId: "owner-1", isOwner: true, canEdit: true })).toBe(true);
    expect(canDeleteTaskDirectly({ tasks, taskId: "task-1", userId: "owner-1", isOwner: true, canEdit: true })).toBe(true);
  });

  it("lets collaborator delete their own task directly if all subtasks are theirs", () => {
    expect(canDeleteTaskDirectly({ tasks, taskId: "task-1", userId: "user-collab", isOwner: false, canEdit: true })).toBe(true);
  });

  it("requires approval when collaborator deletes another user's task", () => {
    expect(canDeleteTaskDirectly({ tasks, taskId: "task-2", userId: "user-collab", isOwner: false, canEdit: true })).toBe(false);
  });

  it("requires approval when collaborator's task has subtasks created by others", () => {
    expect(canDeleteTaskDirectly({ tasks, taskId: "task-3", userId: "user-collab", isOwner: false, canEdit: true })).toBe(false);
  });
});

describe("intent lookup ignores Object.prototype names", () => {
  // A plain map lookup matches these, e.g. "constructor" is Object itself, which
  // would hand the whole action context (env included) back to the client.
  const PROTOTYPE_NAMES = [
    "constructor",
    "toString",
    "toLocaleString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "__proto__",
    "__defineGetter__",
    "__lookupGetter__",
  ];
  const SECRET = "test-secret-do-not-leak";

  async function postIntent(intent: string) {
    const body = new FormData();
    body.set("intent", intent);
    const request = new Request("https://synx.test/list-1", { method: "POST", body });
    return action({
      request,
      params: { id: "list-1" },
      context: { cloudflare: { env: { ...env, TEST_SECRET: SECRET } } },
    } as unknown as ActionFunctionArgs);
  }

  it("neither dispatch map has them as its own keys", () => {
    for (const name of PROTOTYPE_NAMES) {
      expect(Object.hasOwn(ACCOUNT_INTENTS, name)).toBe(false);
      expect(Object.hasOwn(LIST_INTENTS, name)).toBe(false);
    }
  });

  it("returns 400 Invalid intent for each, without leaking the context or env", async () => {
    for (const name of PROTOTYPE_NAMES) {
      const res = await postIntent(name);
      expect(res, name).toBeInstanceOf(Response);
      const response = res as Response;
      expect(response.status, name).toBe(400);
      const text = await response.text();
      expect(JSON.parse(text), name).toEqual({ error: "Invalid intent" });
      expect(text).not.toContain(SECRET);
    }
  });
});

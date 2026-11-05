import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { ActionFunctionArgs } from "react-router";
import { action } from "../app/features/list/action.server";
import { ACCOUNT_INTENTS, LIST_INTENTS } from "../app/features/list/actions/index.server";
import { checkListAccessGate, type ListAccessInfo } from "../app/features/list/actions/access.server";

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

describe("signed-in access gate", () => {
  const unauthorizedAccess: ListAccessInfo = {
    hasOwnership: false,
    isCollaborative: false,
    activeShareMode: "private",
    listOwnerId: "other-user",
  };

  const ownedListAccess: ListAccessInfo = {
    hasOwnership: true,
    isCollaborative: false,
    activeShareMode: "private",
    listOwnerId: "user-1",
  };

  const collabListAccess: ListAccessInfo = {
    hasOwnership: false,
    isCollaborative: true,
    activeShareMode: "public_edit",
    listOwnerId: "other-user",
  };

  it("returns 403 Unauthorized access to list when signed-in user lacks access", async () => {
    for (const intent of Object.keys(LIST_INTENTS)) {
      if (intent === "createList") continue;
      const res = checkListAccessGate(intent, true, unauthorizedAccess);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
      const data = (await res?.json()) as { error: string };
      expect(data.error).toBe("Unauthorized access to list");
    }
  });

  it("permits createList for signed-in users without active list access", () => {
    const res = checkListAccessGate("createList", true, unauthorizedAccess);
    expect(res).toBeNull();
  });

  it("permits all list intents for list owners", () => {
    for (const intent of Object.keys(LIST_INTENTS)) {
      const res = checkListAccessGate(intent, true, ownedListAccess);
      expect(res).toBeNull();
    }
  });

  it("permits all list intents on collaborative lists", () => {
    for (const intent of Object.keys(LIST_INTENTS)) {
      const res = checkListAccessGate(intent, true, collabListAccess);
      expect(res).toBeNull();
    }
  });
});

describe("account intents run before the list access gate", () => {
  it("dispatches account intents without evaluating active list access", async () => {
    // When a guest hits listActivity, the account handler returns 401 "Sign in required",
    // whereas list intents through the access gate would return 200 (guestLocalStorage) or 403.
    const body = new FormData();
    body.set("intent", "listActivity");
    const request = new Request("https://synx.test/nonexistent-list", { method: "POST", body });
    const res = await action({
      request,
      params: { id: "nonexistent-list" },
      context: { cloudflare: { env } },
    } as unknown as ActionFunctionArgs);

    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(401);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Sign in required");
  });

  it("handles guest migration account intent without list access checks", async () => {
    const body = new FormData();
    body.set("intent", "migrateGuestLists");
    const request = new Request("https://synx.test/nonexistent-list", { method: "POST", body });
    const res = await action({
      request,
      params: { id: "nonexistent-list" },
      context: { cloudflare: { env } },
    } as unknown as ActionFunctionArgs);

    expect(res).toBeInstanceOf(Response);
    const response = res as Response;
    expect(response.status).toBe(200);
    const data = (await response.json()) as { success: boolean };
    expect(data.success).toBe(true);
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
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
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

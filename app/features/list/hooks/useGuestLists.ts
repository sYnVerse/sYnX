import { useCallback, useEffect, useMemo } from "react";
import type { FetcherWithComponents } from "@remix-run/react";
import { readStoredValue, useHydrated, useStoredValue, writeStoredValue } from "~/client-storage";
import { applySetCompletedLocal } from "../../../../shared";
import type { Todo } from "~/to-do-manager";
import type { GuestActionPayload } from "~/guest-context";
import { GUEST_STORAGE_KEY, parseGuestLists, type GuestList } from "../guest-lists";

interface UseGuestListsOptions {
  isLoggedIn: boolean;
  userId: string;
  serverLists: GuestList[];
  activeListId: string | undefined;
  listFetcher: FetcherWithComponents<unknown>;
}

export function useGuestLists({
  isLoggedIn,
  userId,
  serverLists,
  activeListId,
  listFetcher,
}: UseGuestListsOptions) {
  const hydrated = useHydrated();
  const [storedGuestLists] = useStoredValue(GUEST_STORAGE_KEY);

  // Guest lists live in localStorage, so they are empty until hydration.
  const guestLists = useMemo(
    () => (hydrated && !isLoggedIn ? parseGuestLists(storedGuestLists, userId) : []),
    [hydrated, isLoggedIn, storedGuestLists, userId]
  );

  // After signing in, move any guest lists into the account once.
  const submitListFetcher = listFetcher.submit;
  useEffect(() => {
    if (!isLoggedIn) return;
    const raw = readStoredValue(GUEST_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validLists = parsed.filter((gList: { name?: string; todos?: unknown[] }) => {
          const listName = (gList.name || "My Tasks").trim();
          const hasTodos = Array.isArray(gList.todos) && gList.todos.length > 0;
          if (listName === "My Tasks" && !hasTodos) {
            return false;
          }
          return true;
        });
        if (validLists.length > 0) {
          const form = new FormData();
          form.append("intent", "migrateGuestLists");
          form.append("guestLists", JSON.stringify(validLists));
          submitListFetcher(form, { method: "post" });
        }
        writeStoredValue(GUEST_STORAGE_KEY, null);
      }
    } catch (e) {
      console.error("Failed to migrate guest lists:", e);
    }
  }, [isLoggedIn, userId, submitListFetcher]);

  const isSharedServerList = serverLists.some((l) => l.id === activeListId && l.owner_id !== userId);
  const lists = isLoggedIn || isSharedServerList ? serverLists : guestLists;
  const activeListMeta = lists.find((l) => l.id === activeListId) || lists[0];
  const effectiveActiveListId = activeListMeta ? activeListMeta.id : activeListId;
  const activeTodos: Todo[] | undefined = activeListMeta?.todos;
  const todos: Todo[] = useMemo(() => activeTodos || [], [activeTodos]);

  const handleGuestAction = useCallback((intent: string, payload: GuestActionPayload = {}) => {
    if (isLoggedIn) return;
    // Task changes on a shared list go to the server. List changes (create,
    // rename, delete, category) always target the guest's own local lists.
    const isListIntent =
      intent === "createList" || intent === "renameList" || intent === "deleteList" || intent === "updateListCategory";
    if (isSharedServerList && !isListIntent) return;
    // Read the latest stored lists (not the render's copy) so back-to-back
    // actions build on each other. Stamp the fallback list on first change.
    const now = Date.now();
    const prevLists = parseGuestLists(readStoredValue(GUEST_STORAGE_KEY), userId).map((l) =>
      l.created_at ? l : { ...l, created_at: now }
    );
    let targetListId = payload.listId || effectiveActiveListId;
    let targetList = prevLists.find((l) => l.id === targetListId);
    if (!targetList && prevLists.length > 0) {
      targetList = prevLists[0];
      targetListId = targetList.id;
    }

    let updatedLists = [...prevLists];

    switch (intent) {
      case "create": {
        const newTodo: Todo = {
          id: crypto.randomUUID(),
          listId: targetListId || userId || "guest_default",
          text: payload.text || "",
          completed: false,
          createdAt: Date.now(),
          priority: payload.priority || "none",
          reminderAt: payload.reminderAt ? Number(payload.reminderAt) : undefined,
          reminderSent: payload.reminderAt ? false : undefined,
          parentId: payload.parentId || undefined,
          recurrence: payload.recurrence || "none",
          durationMinutes: payload.durationMinutes ?? undefined,
        };
        if (prevLists.length === 0) {
          const defaultList: GuestList = {
            id: targetListId || userId || "guest_default",
            name: "My Tasks",
            owner_id: userId,
            created_at: Date.now(),
            share_mode: "private",
            todos: [newTodo],
          };
          updatedLists = [defaultList];
        } else {
          updatedLists = prevLists.map((l) =>
            l.id === targetListId ? { ...l, todos: [newTodo, ...l.todos] } : l
          );
        }
        break;
      }
      case "toggle": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          const updatedTodos = l.todos.map((t) => {
            if (t.id !== payload.id) return t;
            return applySetCompletedLocal(t, !t.completed).todo;
          });
          return { ...l, todos: updatedTodos };
        });
        break;
      }
      case "setCompleted": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          const updatedTodos = l.todos.map((t) => {
            if (t.id !== payload.id) return t;
            return applySetCompletedLocal(t, Boolean(payload.completed)).todo;
          });
          return { ...l, todos: updatedTodos };
        });
        break;
      }
      case "delete": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          return {
            ...l,
            todos: l.todos.filter((t) => t.id !== payload.id && t.parentId !== payload.id),
          };
        });
        break;
      }
      case "updatePriority": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          return {
            ...l,
            todos: l.todos.map((t) => (t.id === payload.id ? { ...t, priority: payload.priority || "none" } : t)),
          };
        });
        break;
      }
      case "updateText": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          return {
            ...l,
            todos: l.todos.map((t) => (t.id === payload.id ? { ...t, text: payload.text || t.text } : t)),
          };
        });
        break;
      }
      case "updateReminder": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          return {
            ...l,
            todos: l.todos.map((t) =>
              t.id === payload.id
                ? {
                    ...t,
                    reminderAt: payload.reminderAt ? Number(payload.reminderAt) : undefined,
                    reminderSent: payload.reminderAt ? false : undefined,
                  }
                : t
            ),
          };
        });
        break;
      }
      case "updateRecurrence": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          return {
            ...l,
            todos: l.todos.map((t) => (t.id === payload.id ? { ...t, recurrence: payload.recurrence || "none" } : t)),
          };
        });
        break;
      }
      case "updateDuration": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          return {
            ...l,
            todos: l.todos.map((t) => (t.id === payload.id ? { ...t, durationMinutes: payload.durationMinutes ?? undefined } : t)),
          };
        });
        break;
      }
      case "clearCompleted": {
        updatedLists = prevLists.map((l) => {
          if (l.id !== targetListId) return l;
          return { ...l, todos: l.todos.filter((t) => !t.completed) };
        });
        break;
      }
      case "createList": {
        const newList: GuestList = {
          id: payload.id || crypto.randomUUID(),
          name: payload.name || "My Tasks",
          owner_id: userId,
          created_at: Date.now(),
          share_mode: "private",
          todos: [],
        };
        updatedLists = [...prevLists, newList];
        break;
      }
      case "renameList": {
        updatedLists = prevLists.map((l) =>
          l.id === payload.listId ? { ...l, name: payload.newName || l.name } : l
        );
        break;
      }
      case "deleteList": {
        updatedLists = prevLists.filter((l) => l.id !== payload.listId);
        break;
      }
      case "updateListCategory": {
        updatedLists = prevLists.map((l) =>
          l.id === payload.id ? { ...l, category: payload.category } : l
        );
        break;
      }
    }

    writeStoredValue(GUEST_STORAGE_KEY, JSON.stringify(updatedLists));
  }, [isLoggedIn, isSharedServerList, effectiveActiveListId, userId]);

  // Guests on someone else's shared list can edit tasks but not reminders.
  const canSetReminders = isLoggedIn || !isSharedServerList;
  const activeListOwnerId = activeListMeta?.owner_id;
  const guestContextValue = useMemo(
    () => ({
      isLoggedIn,
      canSetReminders,
      currentUserId: userId,
      listOwnerId: activeListOwnerId,
      onGuestAction: handleGuestAction,
    }),
    [isLoggedIn, canSetReminders, userId, activeListOwnerId, handleGuestAction]
  );

  return {
    hydrated,
    guestLists,
    lists,
    activeListMeta,
    effectiveActiveListId,
    isSharedServerList,
    todos,
    canSetReminders,
    activeListOwnerId,
    guestContextValue,
    handleGuestAction,
  };
}

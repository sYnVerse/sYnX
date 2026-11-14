import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Linking, Platform } from "react-native";
import type { QueryClient } from "@tanstack/react-query";
import { apiClient, DEVICE_PUSH_TOKEN_KEY } from "../api/client";
import {
  SOFT_ASK_REASK_MS,
  evaluateSoftAskPolicy,
  mapExpoPermissionToStatus,
  REMINDER_NOTIFICATION_CATEGORY,
  REMINDER_ACTION_COMPLETE,
  REMINDER_ACTION_SNOOZE,
  computeSnoozedReminderAt,
  reminderNotificationIdentifier,
  extractReminderNotificationActionPayload,
  extractPendingNotificationOps,
  reconcilePendingNotificationOps,
  removeHandledNotificationOps,
  classifyWidgetReplayError,
  applySetCompletedLocal,
  type PushPermissionStatus,
  type PendingNotificationOp,
  type TodoItem,
} from "../shared";
import { reconcileTasksWithNativeCalendar, syncTaskToNativeCalendar } from "./calendar";
import { getCachedListName } from "./listNames";
import { syncAllWidgets } from "./widgetSync";

export { SOFT_ASK_REASK_MS };
export type { PushPermissionStatus };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const REMINDER_NOTIFICATION_TASK = "synx-reminder-notification-task";
export const SYNX_PENDING_NOTIFICATION_OPS_KEY = "SYNX_PENDING_NOTIFICATION_OPS";

const SOFT_ASK_DECLINED_AT_KEY = "SYNX_PUSH_SOFT_ASK_DECLINED_AT";
const SOFT_ASK_REMINDER_NUDGED_KEY = "SYNX_PUSH_SOFT_ASK_REMINDER_NUDGED";
export const PUSH_USER_DISABLED_KEY = "SYNX_PUSH_USER_DISABLED";

export async function ensureReminderNotificationCategory(): Promise<void> {
  if (Platform.OS === "web") return;
  if (typeof Notifications.setNotificationCategoryAsync !== "function") return;
  await Notifications.setNotificationCategoryAsync(REMINDER_NOTIFICATION_CATEGORY, [
    {
      identifier: REMINDER_ACTION_COMPLETE,
      buttonTitle: "Complete",
      options: {
        opensAppToForeground: false,
        isAuthenticationRequired: false,
      },
    },
    {
      identifier: REMINDER_ACTION_SNOOZE,
      buttonTitle: "Snooze",
      options: {
        opensAppToForeground: false,
        isAuthenticationRequired: false,
      },
    },
  ]);
}

export async function isPushDisabledByUser(): Promise<boolean> {
  const val = await AsyncStorage.getItem(PUSH_USER_DISABLED_KEY);
  return val === "true";
}

export async function setPushDisabledByUser(disabled: boolean): Promise<void> {
  if (disabled) {
    await AsyncStorage.setItem(PUSH_USER_DISABLED_KEY, "true");
  } else {
    await AsyncStorage.removeItem(PUSH_USER_DISABLED_KEY);
  }
}

export async function ensureAndroidReminderChannel(): Promise<void> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("task_reminders", {
      name: "Task Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#6366f1",
    });
  }
  await ensureReminderNotificationCategory();
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  const mapped = mapExpoPermissionToStatus({ status, canAskAgain });
  if (mapped === "granted" && Platform.OS === "android") {
    try {
      const channel = await Notifications.getNotificationChannelAsync("task_reminders");
      if (channel && channel.importance === Notifications.AndroidImportance.NONE) {
        return "blocked";
      }
    } catch {
      // Ignore channel query errors and fall back to mapped permission
    }
  }
  return mapped;
}

/** Obtain device token and register with API. Assumes OS permission already granted. */
export async function registerPushTokenIfPermitted(options?: {
  respectUserOptOut?: boolean;
}): Promise<string | null> {
  if (options?.respectUserOptOut !== false && (await isPushDisabledByUser())) {
    return null;
  }
  await ensureAndroidReminderChannel();
  const status = await getPushPermissionStatus();
  if (status !== "granted") return null;

  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data;
    if (!token) return null;

    await apiClient.post("/api/v1/devices", {
      token,
      platform: Platform.OS,
    });
    await SecureStore.setItemAsync(DEVICE_PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.error("Failed to register push token", e);
    return null;
  }
}

/**
 * Request OS permission (after soft ask), then register token on grant.
 * Returns the token, or null if denied / failed.
 */
export async function requestAndRegisterPush(): Promise<string | null> {
  await setPushDisabledByUser(false);
  await ensureAndroidReminderChannel();

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (existing.status !== "granted") {
    if (existing.canAskAgain === false) {
      return null;
    }
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  return registerPushTokenIfPermitted();
}

/** @deprecated Prefer requestAndRegisterPush / registerPushTokenIfPermitted */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  return requestAndRegisterPush();
}

/** Upper bound for an unregister request, so a slow network never leaves it hanging. */
const UNREGISTER_TIMEOUT_MS = 5000;

/**
 * Tell the server to stop sending pushes to this device. The server accepts the
 * push token without a valid session, and the request skips the 401 refresh /
 * sign-out handling, so it works after the session has expired and can never
 * loop. Never throws.
 */
async function sendUnregisterRequest(devicePushToken: string): Promise<void> {
  try {
    await apiClient.delete("/api/v1/devices", {
      data: { token: devicePushToken },
      timeout: UNREGISTER_TIMEOUT_MS,
      skipAuthRefresh: true,
    });
  } catch {
    // Best effort: offline or server error. The server also drops tokens FCM rejects.
  }
}

/** Settings toggle: stop device notifications for this sign-in. */
export async function unregisterPushToken(): Promise<void> {
  try {
    const devicePushToken = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
    if (devicePushToken) {
      await sendUnregisterRequest(devicePushToken);
      await SecureStore.deleteItemAsync(DEVICE_PUSH_TOKEN_KEY);
    }
  } catch (e) {
    console.error("Failed to unregister push token", e);
  }
}

/**
 * Sign-out (manual or forced): forget the stored push token and unregister it
 * in the background, so sign-out never waits on the network.
 */
export async function releasePushTokenForSignOut(): Promise<void> {
  try {
    const devicePushToken = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
    if (!devicePushToken) return;
    await SecureStore.deleteItemAsync(DEVICE_PUSH_TOKEN_KEY);
    void sendUnregisterRequest(devicePushToken);
  } catch (e) {
    console.error("Failed to release push token on sign-out", e);
  }
}

export async function hasStoredPushToken(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(DEVICE_PUSH_TOKEN_KEY);
  return Boolean(token);
}

export async function markSoftAskDeclined(): Promise<void> {
  await AsyncStorage.setItem(SOFT_ASK_DECLINED_AT_KEY, String(Date.now()));
}

export async function clearSoftAskDeclined(): Promise<void> {
  await AsyncStorage.removeItem(SOFT_ASK_DECLINED_AT_KEY);
  await AsyncStorage.removeItem(SOFT_ASK_REMINDER_NUDGED_KEY);
}

export async function shouldShowSoftAsk(options?: {
  /** Contextual re-ask when user first sets a reminder after declining */
  contextualReminder?: boolean;
}): Promise<boolean> {
  let status = await getPushPermissionStatus();
  // denied + cannot ask again → treat as blocked for policy
  if (status === "denied") {
    const perms = await Notifications.getPermissionsAsync();
    if (perms.canAskAgain === false) status = "blocked";
  }

  const declinedAtRaw = await AsyncStorage.getItem(SOFT_ASK_DECLINED_AT_KEY);
  const declinedAt = declinedAtRaw != null ? Number(declinedAtRaw) : null;
  const nudged = await AsyncStorage.getItem(SOFT_ASK_REMINDER_NUDGED_KEY);

  return evaluateSoftAskPolicy({
    permission: status,
    declinedAt,
    contextualReminderNudged: Boolean(nudged),
    contextualReminder: options?.contextualReminder,
  });
}

export async function markContextualReminderNudgeShown(): Promise<void> {
  await AsyncStorage.setItem(SOFT_ASK_REMINDER_NUDGED_KEY, "1");
}

export async function openAppSystemSettings(): Promise<void> {
  await Linking.openSettings();
}

export async function scheduleLocalNotification(
  id: string,
  title: string,
  body: string,
  triggerTimestamp: number,
  options?: { todoId?: string; listId?: string }
) {
  if (triggerTimestamp <= Date.now()) return;
  await ensureReminderNotificationCategory().catch(() => {});
  const todoId = options?.todoId ?? id;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title,
      body,
      sound: true,
      categoryIdentifier: REMINDER_NOTIFICATION_CATEGORY,
      data: {
        todoId,
        ...(options?.listId ? { listId: options.listId } : {}),
        title,
        message: body,
        categoryId: REMINDER_NOTIFICATION_CATEGORY,
        channelId: "task_reminders",
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerTimestamp),
    },
  });
}

export async function cancelLocalNotification(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}

const ACTION_DEDUP_WINDOW_MS = 2000;
const handledActionKeys = new Map<string, number>();
let notificationQueueLock: Promise<unknown> = Promise.resolve();
let isDrainingNotificationOps = false;
let drainNotificationOpsRequestedWhileBusy = false;

function withNotificationQueueLock<T>(work: () => Promise<T>): Promise<T> {
  const run = notificationQueueLock.then(work, work);
  notificationQueueLock = run.catch(() => undefined);
  return run;
}

/** Testing helper to clear in-memory deduplication state between runs. */
export function resetNotificationActionDedupForTests(): void {
  handledActionKeys.clear();
}

function getActionDedupKey(
  rawEvent: unknown,
  notificationId: string,
  todoId: string,
  actionIdentifier: string
): string {
  const root = rawEvent && typeof rawEvent === "object" ? (rawEvent as Record<string, unknown>) : null;
  const event =
    root && typeof root.actionIdentifier === "string"
      ? root
      : root?.data && typeof root.data === "object"
        ? (root.data as Record<string, unknown>)
        : null;
  const notification =
    event?.notification && typeof event.notification === "object"
      ? (event.notification as Record<string, unknown>)
      : null;
  const dateTag = typeof notification?.date === "number" ? String(notification.date) : "";
  return `${notificationId || todoId}:${actionIdentifier}:${dateTag}`;
}

function shouldDeduplicateAction(key: string, now: number): boolean {
  for (const [k, at] of handledActionKeys.entries()) {
    if (now - at > 5 * 60 * 1000) {
      handledActionKeys.delete(k);
    }
  }
  const previousAt = handledActionKeys.get(key);
  if (previousAt !== undefined && (!key.endsWith(":") ? true : now - previousAt < ACTION_DEDUP_WINDOW_MS)) {
    return true;
  }
  handledActionKeys.set(key, now);
  return false;
}

function patchTodoInQueryCaches(
  queryClient: QueryClient | undefined,
  listId: string | undefined,
  todoId: string,
  updater: (item: TodoItem) => TodoItem
): void {
  if (!queryClient || !listId) return;
  const patchList = (old: TodoItem[] | undefined): TodoItem[] | undefined => {
    if (!old) return old;
    return old.map((t) => {
      if (t.id === todoId) return updater(t);
      if (t.subtasks?.some((s) => s.id === todoId)) {
        return {
          ...t,
          subtasks: t.subtasks.map((s) => (s.id === todoId ? updater(s) : s)),
        };
      }
      return t;
    });
  };
  queryClient.setQueryData<TodoItem[]>(["todos", listId], patchList);
  queryClient.setQueryData<TodoItem[]>(["active_list_todos_preview", listId], patchList);
}

function invalidateTodoCaches(queryClient: QueryClient | undefined, listId: string | undefined): void {
  if (!queryClient) return;
  if (listId) {
    queryClient.invalidateQueries({ queryKey: ["todos", listId], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["list_meta", listId], refetchType: "all" });
  }
  queryClient.invalidateQueries({ queryKey: ["lists"] });
}

async function readPendingNotificationOps(): Promise<PendingNotificationOp[]> {
  try {
    const raw = await AsyncStorage.getItem(SYNX_PENDING_NOTIFICATION_OPS_KEY);
    if (!raw) return [];
    return extractPendingNotificationOps(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writePendingNotificationOps(ops: readonly PendingNotificationOp[]): Promise<void> {
  if (ops.length === 0) {
    await AsyncStorage.removeItem(SYNX_PENDING_NOTIFICATION_OPS_KEY);
  } else {
    await AsyncStorage.setItem(SYNX_PENDING_NOTIFICATION_OPS_KEY, JSON.stringify(ops));
  }
}

async function queuePendingNotificationOp(op: PendingNotificationOp): Promise<void> {
  await withNotificationQueueLock(async () => {
    const existing = await readPendingNotificationOps();
    const reconciled = reconcilePendingNotificationOps([...existing, op]);
    await writePendingNotificationOps(reconciled);
  });
}

async function dismissReminderUiAndScheduled(todoId: string, notificationId?: string): Promise<void> {
  if (notificationId && typeof Notifications.dismissNotificationAsync === "function") {
    await Notifications.dismissNotificationAsync(notificationId).catch(() => {});
  }
  const idsToCancel = new Set<string>([todoId, reminderNotificationIdentifier(todoId)]);
  if (notificationId) idsToCancel.add(notificationId);
  for (const id of idsToCancel) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
}

async function applySyncedTodoSideEffects(
  todo: TodoItem | undefined,
  fallbackListId: string | undefined,
  queryClient: QueryClient | undefined
): Promise<void> {
  const effectiveListId = todo?.listId ?? fallbackListId;
  if (queryClient && todo && effectiveListId) {
    patchTodoInQueryCaches(queryClient, effectiveListId, todo.id, (item) => ({
      ...item,
      ...todo,
      subtasks: item.subtasks,
    }));
  }
  invalidateTodoCaches(queryClient, effectiveListId);
  if (todo) {
    await syncTaskToNativeCalendar(todo, {
      listName: queryClient ? getCachedListName(queryClient, todo.listId) : undefined,
    }).catch(() => {});
  }
  await syncAllWidgets(queryClient).catch(() => {});
}

/**
 * Handles Complete or Snooze taps from reminder notifications (foreground,
 * background, lock screen, or killed/headless launch). Queues failed network
 * requests offline for replay on reconnect or foreground resume.
 */
export async function handleReminderNotificationAction(
  rawEvent: unknown,
  queryClient?: QueryClient
): Promise<boolean> {
  const payload = extractReminderNotificationActionPayload(rawEvent);
  if (!payload) return false;

  const now = Date.now();
  const dedupKey = getActionDedupKey(
    rawEvent,
    payload.notificationId,
    payload.todoId,
    payload.actionIdentifier
  );
  if (shouldDeduplicateAction(dedupKey, now)) {
    return false;
  }

  if (payload.actionIdentifier === REMINDER_ACTION_COMPLETE) {
    await dismissReminderUiAndScheduled(payload.todoId, payload.notificationId);
    patchTodoInQueryCaches(queryClient, payload.listId, payload.todoId, (item) =>
      applySetCompletedLocal(item, true).todo
    );

    try {
      const res = await apiClient.post(`/api/v1/todos/${payload.todoId}/completed`, {
        completed: true,
      });
      const updatedTodo = res.data?.todo as TodoItem | undefined;
      await applySyncedTodoSideEffects(updatedTodo, payload.listId, queryClient);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (classifyWidgetReplayError(status) === "retry") {
        await queuePendingNotificationOp({
          kind: "complete",
          todoId: payload.todoId,
          ...(payload.listId ? { listId: payload.listId } : {}),
          completed: true,
          at: now,
        });
      }
    }
    return true;
  }

  if (payload.actionIdentifier === REMINDER_ACTION_SNOOZE) {
    if (payload.notificationId && typeof Notifications.dismissNotificationAsync === "function") {
      await Notifications.dismissNotificationAsync(payload.notificationId).catch(() => {});
    }
    const reminderAt = computeSnoozedReminderAt(now);
    const localId = reminderNotificationIdentifier(payload.todoId);
    await scheduleLocalNotification(
      localId,
      payload.title || "sYnX Reminder",
      payload.body || "Task reminder",
      reminderAt,
      { todoId: payload.todoId, listId: payload.listId }
    ).catch(() => {});

    patchTodoInQueryCaches(queryClient, payload.listId, payload.todoId, (item) => ({
      ...item,
      reminderAt,
      reminderSent: false,
    }));

    try {
      const res = await apiClient.put(`/api/v1/todos/${payload.todoId}`, { reminderAt });
      const updatedTodo = res.data?.todo as TodoItem | undefined;
      await applySyncedTodoSideEffects(updatedTodo, payload.listId, queryClient);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (classifyWidgetReplayError(status) === "retry") {
        await queuePendingNotificationOp({
          kind: "snooze",
          todoId: payload.todoId,
          ...(payload.listId ? { listId: payload.listId } : {}),
          reminderAt,
          ...(payload.title ? { title: payload.title } : {}),
          ...(payload.body ? { body: payload.body } : {}),
          at: now,
        });
      }
    }
    return true;
  }

  return false;
}

type ReplayOutcome = {
  op: PendingNotificationOp;
  status: "applied" | "rejected" | "retry";
  todo?: TodoItem;
};

async function replayPendingNotificationOp(op: PendingNotificationOp): Promise<ReplayOutcome> {
  try {
    if (op.kind === "complete") {
      const res = await apiClient.post(`/api/v1/todos/${op.todoId}/completed`, {
        completed: true,
      });
      return { op, status: "applied", todo: res.data?.todo as TodoItem | undefined };
    }

    const res = await apiClient.put(`/api/v1/todos/${op.todoId}`, {
      reminderAt: op.reminderAt,
    });
    let todo = res.data?.todo as TodoItem | undefined;
    if (op.reminderAt <= Date.now()) {
      try {
        const marked = await apiClient.post(`/api/v1/todos/${op.todoId}/mark-reminder-sent`);
        if (marked.data?.todo) {
          todo = marked.data.todo as TodoItem;
        }
      } catch {
        // Non-fatal: snooze update already landed on the server.
      }
    }
    return { op, status: "applied", todo };
  } catch (err: unknown) {
    const statusCode = (err as { response?: { status?: number } })?.response?.status;
    return { op, status: classifyWidgetReplayError(statusCode) };
  }
}

/**
 * Replays notification Complete / Snooze actions that were queued while offline.
 */
export async function drainAndReplayPendingNotificationOps(
  queryClient?: QueryClient
): Promise<void> {
  if (isDrainingNotificationOps) {
    drainNotificationOpsRequestedWhileBusy = true;
    return;
  }

  isDrainingNotificationOps = true;
  try {
    do {
      drainNotificationOpsRequestedWhileBusy = false;

      const snapshot = await withNotificationQueueLock(() => readPendingNotificationOps());
      if (snapshot.length === 0) continue;

      const reconciled = reconcilePendingNotificationOps(snapshot);
      const outcomes: ReplayOutcome[] = [];
      for (const op of reconciled) {
        outcomes.push(await replayPendingNotificationOp(op));
      }

      const handledTodoIds = new Set(
        outcomes.filter((o) => o.status !== "retry").map((o) => o.op.todoId)
      );
      const handled = snapshot.filter((op) => handledTodoIds.has(op.todoId));

      if (handled.length > 0) {
        await withNotificationQueueLock(async () => {
          const latest = await readPendingNotificationOps();
          await writePendingNotificationOps(removeHandledNotificationOps(latest, handled));
        });
      }

      const appliedTodos: TodoItem[] = [];
      const touchedListIds = new Set<string>();
      for (const outcome of outcomes) {
        if (outcome.status !== "applied") continue;
        const listId = outcome.todo?.listId ?? outcome.op.listId;
        if (listId) touchedListIds.add(listId);
        if (outcome.todo) {
          appliedTodos.push(outcome.todo);
          patchTodoInQueryCaches(queryClient, listId, outcome.todo.id, (item) => ({
            ...item,
            ...outcome.todo,
            subtasks: item.subtasks,
          }));
        }
      }

      for (const listId of touchedListIds) {
        invalidateTodoCaches(queryClient, listId);
      }

      if (appliedTodos.length > 0) {
        await reconcileTasksWithNativeCalendar(
          appliedTodos,
          queryClient ? (listId) => getCachedListName(queryClient, listId) : undefined
        ).catch(() => 0);
      }
      if (outcomes.some((o) => o.status === "applied")) {
        await syncAllWidgets(queryClient).catch(() => {});
      }
    } while (drainNotificationOpsRequestedWhileBusy);
  } catch (e) {
    console.warn("[notifications] Error draining pending notification ops:", e);
  } finally {
    isDrainingNotificationOps = false;
  }
}

try {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(
    REMINDER_NOTIFICATION_TASK,
    async ({ data, error }) => {
      if (error || !data) {
        return Notifications.BackgroundNotificationTaskResult?.NoData;
      }
      const handled = await handleReminderNotificationAction(data);
      return handled
        ? Notifications.BackgroundNotificationTaskResult?.NewData
        : Notifications.BackgroundNotificationTaskResult?.NoData;
    }
  );
} catch {
  // TaskManager may be unavailable in non-native environments.
}

/**
 * Registers reminder categories, background notification task, live action
 * response listener, and foreground offline-queue replay.
 */
export function startNotificationResponseService(queryClient: QueryClient): () => void {
  ensureAndroidReminderChannel().catch(() => {});
  ensureReminderNotificationCategory().catch(() => {});

  if (Platform.OS !== "web" && typeof Notifications.registerTaskAsync === "function") {
    Notifications.registerTaskAsync(REMINDER_NOTIFICATION_TASK).catch(() => {});
  }

  drainAndReplayPendingNotificationOps(queryClient).catch(() => {});

  const responseSub =
    typeof Notifications.addNotificationResponseReceivedListener === "function"
      ? Notifications.addNotificationResponseReceivedListener((response) => {
          void handleReminderNotificationAction(response, queryClient);
        })
      : null;

  const appStateSub = AppState.addEventListener("change", (nextState) => {
    if (nextState === "active") {
      drainAndReplayPendingNotificationOps(queryClient).catch(() => {});
    }
  });

  return () => {
    responseSub?.remove?.();
    appStateSub.remove();
  };
}

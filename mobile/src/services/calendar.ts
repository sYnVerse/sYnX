import { Linking, Platform } from "react-native";
import * as Calendar from "expo-calendar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TodoItem } from "../shared";

const CALENDAR_SYNC_ENABLED_KEY = "@synx_calendar_sync_enabled";
const SYNX_CALENDAR_ID_KEY = "@synx_calendar_id";
const EVENT_MAPPINGS_KEY = "@synx_calendar_event_mappings";
const EVENT_STATE_KEY = "@synx_calendar_event_state";
const COMPLETED_BEHAVIOR_KEY = "@synx_calendar_completed_behavior";

/** What happens to a task's calendar event when the task is done. */
export type CompletedEventBehavior = "mark_done" | "delete";
export const DEFAULT_COMPLETED_EVENT_BEHAVIOR: CompletedEventBehavior = "mark_done";

/**
 * What sYnX last wrote to the calendar for a task, so changes made outside the app
 * (widget, web, another device) can be spotted on the next refresh.
 */
export interface TaskEventState {
  listId?: string;
  /** Reminder time the event was last written with. */
  reminderAt?: number;
  /** Set while the event shows the task as done. */
  completedAt?: number;
  /** The event was deleted because the task was done (Delete event setting). */
  deletedOnComplete?: boolean;
}

/**
 * Check if device calendar sync is enabled in user settings.
 */
export async function isCalendarSyncEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(CALENDAR_SYNC_ENABLED_KEY);
    return val === "true";
  } catch (error) {
    console.warn("Failed to read calendar sync setting:", error);
    return false;
  }
}

/**
 * Enable or disable device calendar sync.
 */
export async function setCalendarSyncEnabled(enabled: boolean): Promise<boolean> {
  try {
    await AsyncStorage.setItem(CALENDAR_SYNC_ENABLED_KEY, enabled ? "true" : "false");
    return true;
  } catch (error) {
    console.error("Failed to save calendar sync setting:", error);
    return false;
  }
}

/**
 * Helper to get stored task ID -> native event ID mappings.
 */
async function getEventMappings(): Promise<Record<string, string>> {
  try {
    const json = await AsyncStorage.getItem(EVENT_MAPPINGS_KEY);
    return json ? JSON.parse(json) : {};
  } catch (error) {
    console.warn("Failed to read calendar event mappings:", error);
    return {};
  }
}

/**
 * Helper to save task ID -> native event ID mappings.
 */
async function saveEventMappings(mappings: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(EVENT_MAPPINGS_KEY, JSON.stringify(mappings));
  } catch (e) {
    console.error("Failed to save calendar event mappings", e);
  }
}

async function getEventStates(): Promise<Record<string, TaskEventState>> {
  try {
    const json = await AsyncStorage.getItem(EVENT_STATE_KEY);
    return json ? JSON.parse(json) : {};
  } catch (error) {
    console.warn("Failed to read calendar event state:", error);
    return {};
  }
}

async function setEventState(taskId: string, state: TaskEventState | null): Promise<void> {
  try {
    const states = await getEventStates();
    if (state) {
      states[taskId] = state;
    } else if (taskId in states) {
      delete states[taskId];
    } else {
      return;
    }
    await AsyncStorage.setItem(EVENT_STATE_KEY, JSON.stringify(states));
  } catch (e) {
    console.error("Failed to save calendar event state", e);
  }
}

/**
 * Read the "When a task is done" setting. Defaults to marking the event as done.
 */
export async function getCompletedEventBehavior(): Promise<CompletedEventBehavior> {
  try {
    const val = await AsyncStorage.getItem(COMPLETED_BEHAVIOR_KEY);
    return val === "delete" || val === "mark_done" ? val : DEFAULT_COMPLETED_EVENT_BEHAVIOR;
  } catch (error) {
    console.warn("Failed to read completed event setting:", error);
    return DEFAULT_COMPLETED_EVENT_BEHAVIOR;
  }
}

/**
 * Save the "When a task is done" setting.
 */
export async function setCompletedEventBehavior(behavior: CompletedEventBehavior): Promise<boolean> {
  try {
    await AsyncStorage.setItem(COMPLETED_BEHAVIOR_KEY, behavior);
    return true;
  } catch (error) {
    console.error("Failed to save completed event setting:", error);
    return false;
  }
}

export type CalendarPermissionStatus = "granted" | "denied" | "undetermined" | "unavailable";

/**
 * Result of checking or requesting calendar access. `canAskAgain` is false once the OS
 * will no longer show the permission dialog (the user must enable access in system settings).
 */
export interface CalendarPermissionResult {
  granted: boolean;
  status: CalendarPermissionStatus;
  canAskAgain: boolean;
}

const UNAVAILABLE_PERMISSION: CalendarPermissionResult = {
  granted: false,
  status: "unavailable",
  canAskAgain: false,
};

function toPermissionResult(res: Calendar.PermissionResponse): CalendarPermissionResult {
  const granted = res.granted === true || res.status === "granted";
  const status: CalendarPermissionStatus = granted
    ? "granted"
    : res.status === "denied"
      ? "denied"
      : "undetermined";
  return { granted, status, canAskAgain: res.canAskAgain !== false };
}

/**
 * Short label for the Settings screen ("Granted", "Not Granted", or "Denied").
 */
export function describeCalendarPermission(result: CalendarPermissionResult): string {
  if (result.granted) return "Granted";
  if (result.status === "denied" && !result.canAskAgain) return "Denied";
  return "Not Granted";
}

/**
 * Check calendar permission status without asking the user.
 */
export async function checkCalendarPermissions(): Promise<CalendarPermissionResult> {
  if (Platform.OS === "web") return UNAVAILABLE_PERMISSION;
  try {
    return toPermissionResult(await Calendar.getCalendarPermissions());
  } catch (error) {
    console.warn("Failed to read calendar permission:", error);
    return UNAVAILABLE_PERMISSION;
  }
}

/**
 * Request calendar permissions from the user. Shows the OS dialog when access is not yet
 * granted and the OS still allows asking; otherwise returns the current state so the caller
 * can send the user to system settings.
 */
export async function requestCalendarPermissions(): Promise<CalendarPermissionResult> {
  if (Platform.OS === "web") return UNAVAILABLE_PERMISSION;
  try {
    const existing = toPermissionResult(await Calendar.getCalendarPermissions());
    if (existing.granted || !existing.canAskAgain) {
      return existing;
    }
    return toPermissionResult(await Calendar.requestCalendarPermissions());
  } catch (error) {
    console.warn("Failed to request calendar permission:", error);
    return UNAVAILABLE_PERMISSION;
  }
}

export const SYNX_CALENDAR_TITLE = "sYnX Tasks";
export const SYNX_CALENDAR_COLOR = "#6366F1";

export interface AvailableCalendar {
  id: string;
  title: string;
  sourceName?: string;
  isPrimary?: boolean;
  isLocal?: boolean;
  isDedicated?: boolean;
  color?: string;
}

/**
 * Query writable calendars available on the device for syncing tasks.
 */
export async function getAvailableCalendars(): Promise<AvailableCalendar[]> {
  if (Platform.OS === "web") return [];

  try {
    const permission = await checkCalendarPermissions();
    if (!permission.granted) return [];

    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

    const isWritable = (c: Calendar.ExpoCalendar) => {
      if (c.allowsModifications !== false) return true;
      const lvl = c.accessLevel;
      return (
        lvl === Calendar.CalendarAccessLevel.OWNER ||
        lvl === Calendar.CalendarAccessLevel.EDITOR ||
        lvl === Calendar.CalendarAccessLevel.CONTRIBUTOR ||
        lvl === Calendar.CalendarAccessLevel.ROOT
      );
    };

    const writable = calendars.filter(isWritable);

    return writable.map((c) => {
      const isDedicated = c.title === SYNX_CALENDAR_TITLE || c.name === SYNX_CALENDAR_TITLE;
      const isLocal =
        c.source?.isLocalAccount === true ||
        c.source?.type?.toLowerCase() === "local";
      const sourceName =
        c.source?.name || c.ownerAccount || (isLocal ? "Local Device" : undefined);

      return {
        id: c.id,
        title: c.title || c.name || "Untitled Calendar",
        sourceName,
        isPrimary: Boolean(c.isPrimary),
        isLocal,
        isDedicated,
        color: c.color,
      };
    });
  } catch (error) {
    console.warn("Failed to get available calendars:", error);
    return [];
  }
}

/**
 * Retrieve the currently configured target calendar ID from AsyncStorage.
 */
export async function getSelectedCalendarId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SYNX_CALENDAR_ID_KEY);
  } catch (e) {
    console.warn("Failed to read selected calendar id:", e);
    return null;
  }
}

/**
 * Set the target calendar ID in AsyncStorage.
 * Events sYnX already created are moved to the chosen calendar (copied there, then
 * deleted from the old one), so switching calendars doesn't leave stale duplicates behind.
 */
export async function setSelectedCalendarId(calendarId: string): Promise<boolean> {
  try {
    const currentId = await AsyncStorage.getItem(SYNX_CALENDAR_ID_KEY);
    if (currentId !== calendarId) {
      await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, calendarId);
      await withCalendarLock(() => moveSyncedEventsToCalendar(calendarId));
    }
    return true;
  } catch (e) {
    console.error("Failed to save selected calendar id:", e);
    return false;
  }
}

/**
 * Move every synced event into the target calendar. Calendars can't move events between
 * each other, so each one is recreated in the new calendar and the old copy deleted.
 * Events that no longer exist are dropped from the mappings.
 */
async function moveSyncedEventsToCalendar(calendarId: string): Promise<void> {
  const mappings = await getEventMappings();
  const taskIds = Object.keys(mappings);
  if (taskIds.length === 0) return;

  let target: Calendar.ExpoCalendar | null = null;
  try {
    target = await Calendar.ExpoCalendar.get(calendarId);
  } catch (error) {
    console.warn("Could not open the new target calendar to move events:", error);
  }

  const next: Record<string, string> = {};
  for (const taskId of taskIds) {
    const eventId = mappings[taskId];
    let event: Calendar.ExpoCalendarEvent;
    try {
      event = await Calendar.ExpoCalendarEvent.get(eventId);
    } catch {
      continue; // Deleted in the calendar app; the next sync recreates it if needed.
    }
    if (event.calendarId === calendarId) {
      next[taskId] = eventId;
      continue;
    }
    if (!target) continue;
    try {
      const moved = await target.createEvent({
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        notes: event.notes,
        timeZone: event.timeZone,
        ...(event.recurrenceRule ? { recurrenceRule: event.recurrenceRule } : {}),
      });
      next[taskId] = moved.id;
      await event.delete();
    } catch (error) {
      console.warn(`Could not move calendar event for task ${taskId}:`, error);
    }
  }
  await saveEventMappings(next);
}

/**
 * Pick a source for a new calendar on iOS: prefer a local source, then Default / iCloud.
 */
function pickIosSource(calendars: Calendar.ExpoCalendar[]): Calendar.Source | undefined {
  let sources: Calendar.Source[] = [];
  try {
    sources = Calendar.getSourcesSync();
  } catch (error) {
    console.warn("Failed to read calendar sources, falling back to existing calendars:", error);
  }
  if (sources.length === 0) {
    sources = calendars.map((c) => c.source).filter((s): s is Calendar.Source => Boolean(s));
  }
  return (
    sources.find((s) => s.type === Calendar.SourceType.LOCAL) ||
    sources.find((s) => s.name === "Default" || s.name === "iCloud") ||
    sources[0]
  );
}

/**
 * Get existing "sYnX Tasks" dedicated calendar or create a new one.
 */
export async function getOrCreateSynxCalendar(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const permission = await requestCalendarPermissions();
    if (!permission.granted) return null;

    // Search existing device calendars for "sYnX Tasks" or stored calendar ID
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

    const storedCalendarId = await AsyncStorage.getItem(SYNX_CALENDAR_ID_KEY);
    if (storedCalendarId) {
      const existing = calendars.find((c) => c.id === storedCalendarId);
      if (existing) {
        return existing.id;
      }
    }

    const existingSynxCalendar = calendars.find(
      (c) => c.title === SYNX_CALENDAR_TITLE || c.name === SYNX_CALENDAR_TITLE
    );
    if (existingSynxCalendar) {
      await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, existingSynxCalendar.id);
      return existingSynxCalendar.id;
    }

    // Create a new "sYnX Tasks" calendar
    let created: Calendar.ExpoCalendar | null = null;
    if (Platform.OS === "ios") {
      const defaultSource = pickIosSource(calendars);
      if (!defaultSource) {
        console.warn("No calendar source available to create the sYnX Tasks calendar");
        return null;
      }

      created = await Calendar.createCalendar({
        title: SYNX_CALENDAR_TITLE,
        color: SYNX_CALENDAR_COLOR,
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: defaultSource.id,
        source: defaultSource,
        name: SYNX_CALENDAR_TITLE,
        ownerAccount: "personal",
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });
    } else if (Platform.OS === "android") {
      // Android has no sources API; create a local calendar owned by the app.
      created = await Calendar.createCalendar({
        title: SYNX_CALENDAR_TITLE,
        color: SYNX_CALENDAR_COLOR,
        entityType: Calendar.EntityTypes.EVENT,
        name: SYNX_CALENDAR_TITLE,
        ownerAccount: "sYnX",
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
        source: {
          isLocalAccount: true,
          name: "sYnX",
          type: Calendar.SourceType.LOCAL,
        },
      });
    }

    if (!created) return null;
    await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, created.id);
    return created.id;
  } catch (error) {
    console.error("Error creating or fetching sYnX native calendar:", error);
    return null;
  }
}

/**
 * Resolve the target calendar for syncing:
 * 1. User's explicitly selected calendar (if still valid)
 * 2. Pre-existing "sYnX Tasks" dedicated calendar (if present)
 * 3. On Android: default primary writable calendar (e.g. Google Calendar) for zero-friction sync
 * 4. Fallback: creates or fetches the dedicated "sYnX Tasks" calendar
 */
export async function resolveTargetCalendar(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const permission = await requestCalendarPermissions();
    if (!permission.granted) return null;

    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);

    // 1. Check if user explicitly selected a calendar that still exists
    const storedCalendarId = await AsyncStorage.getItem(SYNX_CALENDAR_ID_KEY);
    if (storedCalendarId) {
      const existing = calendars.find((c) => c.id === storedCalendarId);
      if (existing) {
        return existing.id;
      }
      // Stale ID, clear it
      await AsyncStorage.removeItem(SYNX_CALENDAR_ID_KEY);
    }

    // 2. Check if a dedicated "sYnX Tasks" calendar already exists on the device
    const existingSynxCalendar = calendars.find(
      (c) => c.title === SYNX_CALENDAR_TITLE || c.name === SYNX_CALENDAR_TITLE
    );
    if (existingSynxCalendar) {
      await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, existingSynxCalendar.id);
      return existingSynxCalendar.id;
    }

    // 3. On Android: default to the primary writable calendar (e.g. Google Calendar)
    // to avoid the unmanaged "Non-Google accounts" issue out of the box
    if (Platform.OS === "android") {
      const primaryWritable =
        calendars.find((c) => c.isPrimary && c.allowsModifications !== false) ||
        calendars.find(
          (c) => c.source?.type === "com.google" && c.allowsModifications !== false
        );

      if (primaryWritable) {
        await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, primaryWritable.id);
        return primaryWritable.id;
      }
    }

    // 4. Fall back to creating or returning the dedicated calendar
    return await getOrCreateSynxCalendar();
  } catch (error) {
    console.error("Error resolving target calendar:", error);
    return null;
  }
}

/**
 * Get details of the current target calendar.
 */
export async function getTargetCalendar(): Promise<AvailableCalendar | null> {
  if (Platform.OS === "web") return null;

  try {
    const calendarId = await resolveTargetCalendar();
    if (!calendarId) return null;

    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const target = calendars.find((c) => c.id === calendarId);
    if (!target) return null;

    const isDedicated = target.title === SYNX_CALENDAR_TITLE || target.name === SYNX_CALENDAR_TITLE;
    const isLocal =
      target.source?.isLocalAccount === true ||
      target.source?.type?.toLowerCase() === "local";
    const sourceName =
      target.source?.name || target.ownerAccount || (isLocal ? "Local Device" : undefined);

    return {
      id: target.id,
      title: target.title || target.name || "Untitled Calendar",
      sourceName,
      isPrimary: Boolean(target.isPrimary),
      isLocal,
      isDedicated,
      color: target.color,
    };
  } catch (error) {
    console.warn("Failed to get target calendar details:", error);
    return null;
  }
}

/**
 * Open the native calendar app on the device.
 * On Android, attempts to open the system calendar intent or Google Calendar.
 * On iOS, attempts to open Apple Calendar.
 */
export async function openCalendarApp(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const url = `content://com.android.calendar/time/${Date.now()}`;
      await Linking.openURL(url);
      return true;
    } catch {
      try {
        await Linking.openURL("https://calendar.google.com/calendar/r");
        return true;
      } catch (err) {
        console.warn("Failed to open calendar app on Android:", err);
        return false;
      }
    }
  } else if (Platform.OS === "ios") {
    try {
      await Linking.openURL("calshow:");
      return true;
    } catch {
      try {
        await Linking.openURL("https://calendar.google.com/calendar/r");
        return true;
      } catch (err) {
        console.warn("Failed to open calendar app on iOS:", err);
        return false;
      }
    }
  }
  return false;
}

const PRIORITY_MARKERS: Record<string, string> = {
  low: "🟢",
  medium: "🟡",
  high: "🔴",
};

/**
 * Description text for a task's calendar event, e.g.
 * "sYnX Task · Groceries | Priority: 🔴 HIGH". The list part is left out when the
 * list name isn't known, and tasks without a priority get no marker.
 */
export function buildTaskEventNotes(
  task: Pick<TodoItem, "priority">,
  listName?: string | null
): string {
  const priority = task.priority || "none";
  const marker = PRIORITY_MARKERS[priority];
  const source = listName?.trim() ? `sYnX Task · ${listName.trim()}` : "sYnX Task";
  return `${source} | Priority: ${marker ? `${marker} ` : ""}${priority.toUpperCase()}`;
}

/** Prefix added to the event title of a task marked done. */
export const COMPLETED_TITLE_PREFIX = "✅ ";

/**
 * Event title for a completed task: the task text with a ✅ in front. Never adds a
 * second ✅ when the title already has one.
 */
export function buildCompletedEventTitle(text: string): string {
  return text.startsWith("✅") ? text : `${COMPLETED_TITLE_PREFIX}${text}`;
}

/** "Completed Oct 26, 2026" in the device's locale. */
export function formatCompletedLine(completedAt: number): string {
  const date = new Date(completedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return `Completed ${date}`;
}

/** Removes a "Completed <date>" line that sYnX added to an event description. */
export function stripCompletedLine(notes: string | null | undefined): string {
  return (notes ?? "")
    .split("\n")
    .filter((line) => !/^Completed\b/.test(line.trim()))
    .join("\n")
    .trimEnd();
}

/**
 * Description for a completed task's event: the usual notes plus a "Completed <date>" line.
 */
export function buildCompletedEventNotes(baseNotes: string, completedAt: number): string {
  const base = stripCompletedLine(baseNotes);
  const line = formatCompletedLine(completedAt);
  return base ? `${base}\n${line}` : line;
}

export interface SyncTaskOptions {
  /** Name of the task's list, shown in the event description. */
  listName?: string | null;
  /** When the task was completed (defaults to now). Used for the "Completed" line. */
  completedAt?: number;
}

// Calendar writes run one at a time, so an in-app check-off and a background
// reconcile can't both read and rewrite the stored mappings at once.
let calendarQueue: Promise<unknown> = Promise.resolve();
function withCalendarLock<T>(work: () => Promise<T>): Promise<T> {
  const run = calendarQueue.then(work, work);
  calendarQueue = run.catch(() => undefined);
  return run;
}

/**
 * Sync a single task to the device's native calendar.
 * - No reminder: any synced event is removed.
 * - Completed: the event is marked done (✅ title and a "Completed" line) or deleted,
 *   depending on the "When a task is done" setting.
 * - Open: the event is created or updated. A task that was un-completed gets its normal
 *   title and description back, or its event recreated if it was deleted.
 * Recurring tasks are never completed (the server moves them to the next date), so their
 * event simply moves along with the reminder.
 */
export function syncTaskToNativeCalendar(
  task: TodoItem,
  options: SyncTaskOptions = {}
): Promise<string | null> {
  if (Platform.OS === "web") return Promise.resolve(null);
  return withCalendarLock(() => syncTaskUnlocked(task, options));
}

async function syncTaskUnlocked(task: TodoItem, options: SyncTaskOptions): Promise<string | null> {
  try {
    const enabled = await isCalendarSyncEnabled();
    if (!enabled) return null;

    if (!task.reminderAt) {
      await removeTaskUnlocked(task.id);
      return null;
    }

    if (task.completed) {
      return await applyCompletedTreatment(task, options);
    }

    const mappings = await getEventMappings();
    const existingEventId = mappings[task.id];

    const calendarId = await resolveTargetCalendar();
    if (!calendarId) return null;

    const startDate = new Date(task.reminderAt);
    // No duration set means a zero-length event (9:00 to 9:00), not a made-up default.
    const durationMinutes =
      typeof task.durationMinutes === "number" && task.durationMinutes > 0 ? task.durationMinutes : 0;
    const endDate = new Date(task.reminderAt + durationMinutes * 60 * 1000);

    // Build recurrence rule if set
    let recurrenceRule: Calendar.RecurrenceRule | undefined;
    if (task.recurrence && task.recurrence !== "none") {
      let frequency: Calendar.Frequency = Calendar.Frequency.DAILY;
      if (task.recurrence === "weekly") frequency = Calendar.Frequency.WEEKLY;
      if (task.recurrence === "monthly") frequency = Calendar.Frequency.MONTHLY;

      recurrenceRule = {
        frequency,
      };
    }

    const eventDetails = {
      title: task.text,
      startDate,
      endDate,
      notes: buildTaskEventNotes(task, options.listName),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    const openState: TaskEventState = { listId: task.listId, reminderAt: task.reminderAt };

    if (existingEventId) {
      try {
        const existingEvent = await Calendar.ExpoCalendarEvent.get(existingEventId);
        // Passing null clears a recurrence that was removed from the task.
        await existingEvent.update({ ...eventDetails, recurrenceRule: recurrenceRule ?? null });
        await setEventState(task.id, openState);
        return existingEventId;
      } catch (error) {
        // Event might have been deleted manually by user in native Calendar app; recreate it.
        console.warn(`Could not update calendar event for task ${task.id}, recreating it:`, error);
      }
    }

    // Create new event
    const calendar = await Calendar.ExpoCalendar.get(calendarId);
    const newEvent = await calendar.createEvent({
      ...eventDetails,
      ...(recurrenceRule ? { recurrenceRule } : {}),
    });
    mappings[task.id] = newEvent.id;
    await saveEventMappings(mappings);
    await setEventState(task.id, openState);
    return newEvent.id;
  } catch (error) {
    console.error(`Failed to sync task ${task.id} to native calendar:`, error);
    return null;
  }
}

/**
 * Mark a completed task's event as done, or delete it, per the user's setting.
 * Tasks without a synced event are left alone (nothing is created for them).
 */
async function applyCompletedTreatment(
  task: TodoItem,
  options: SyncTaskOptions
): Promise<string | null> {
  const mappings = await getEventMappings();
  const eventId = mappings[task.id];
  if (!eventId) return null;

  const states = await getEventStates();
  const completedAt = states[task.id]?.completedAt ?? options.completedAt ?? Date.now();
  const behavior = await getCompletedEventBehavior();

  if (behavior === "delete") {
    await removeTaskUnlocked(task.id);
    // Remember the deletion so un-completing the task brings the event back.
    await setEventState(task.id, {
      listId: task.listId,
      reminderAt: task.reminderAt,
      completedAt,
      deletedOnComplete: true,
    });
    return null;
  }

  try {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    // Without a list name (e.g. a background widget sync) keep the event's own description.
    const baseNotes = options.listName?.trim()
      ? buildTaskEventNotes(task, options.listName)
      : stripCompletedLine(event.notes) || buildTaskEventNotes(task);
    await event.update({
      title: buildCompletedEventTitle(task.text),
      notes: buildCompletedEventNotes(baseNotes, completedAt),
    });
    await setEventState(task.id, {
      listId: task.listId,
      reminderAt: task.reminderAt,
      completedAt,
    });
    return eventId;
  } catch (error) {
    // The event was deleted in the calendar app; nothing left to mark.
    console.warn(`Could not mark calendar event done for task ${task.id}:`, error);
    delete mappings[task.id];
    await saveEventMappings(mappings);
    await setEventState(task.id, null);
    return null;
  }
}

/**
 * Remove a task's synced event from native device calendar.
 */
export function removeTaskFromNativeCalendar(taskId: string): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve();
  return withCalendarLock(() => removeTaskUnlocked(taskId));
}

async function removeTaskUnlocked(taskId: string): Promise<void> {
  try {
    const mappings = await getEventMappings();
    const eventId = mappings[taskId];
    if (eventId) {
      try {
        const event = await Calendar.ExpoCalendarEvent.get(eventId);
        await event.delete();
      } catch (error) {
        // Likely already deleted from the native calendar; drop the mapping anyway.
        console.warn(`Could not delete calendar event for task ${taskId}:`, error);
      }
      delete mappings[taskId];
      await saveEventMappings(mappings);
    }
    await setEventState(taskId, null);
  } catch (error) {
    console.error(`Failed to remove calendar event for task ${taskId}:`, error);
  }
}

/**
 * Bulk sync all given tasks to the native device calendar.
 * getListName supplies each task's list name for the event description.
 */
export async function syncAllTasksToNativeCalendar(
  tasks: TodoItem[],
  getListName?: (listId: string) => string | null
): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    const calendarId = await resolveTargetCalendar();
    if (!calendarId) return;

    await withCalendarLock(async () => {
      for (const task of tasks) {
        await syncTaskUnlocked(task, { listName: getListName?.(task.listId) ?? null });
      }
    });
  } catch (error) {
    console.error("Failed bulk sync of tasks to native calendar:", error);
  }
}

function flattenTasks(tasks: TodoItem[]): TodoItem[] {
  const out: TodoItem[] = [];
  for (const task of tasks) {
    out.push(task);
    if (task.subtasks?.length) out.push(...flattenTasks(task.subtasks));
  }
  return out;
}

/**
 * Decide whether a task's calendar event is out of date with the task, based on what
 * sYnX last wrote to the calendar. Only tasks that already have (or had) a synced event
 * are considered, so this never creates events for tasks the user didn't sync.
 */
export function taskNeedsCalendarReconcile(
  task: TodoItem,
  hasEvent: boolean,
  state: TaskEventState | undefined
): boolean {
  if (hasEvent) {
    if (!task.reminderAt) return true;
    if (task.completed) return state?.completedAt === undefined;
    // Un-completed somewhere else: restore the normal title and description.
    if (state?.completedAt !== undefined) return true;
    // Reminder moved elsewhere (e.g. a recurring task checked off on the widget).
    return state?.reminderAt !== undefined && state.reminderAt !== task.reminderAt;
  }
  // Event was deleted when the task was done; bring it back if the task is open again.
  return Boolean(state?.deletedOnComplete && !task.completed && task.reminderAt);
}

/**
 * Bring the device calendar in line with the latest task data. This catches changes the
 * app didn't make itself: check-offs from the home screen widget, the web app, or another
 * device. Completed tasks get the "When a task is done" treatment, un-completed tasks are
 * restored, and moved reminders move their event. Does nothing without calendar access,
 * and never shows a permission prompt.
 */
export async function reconcileTasksWithNativeCalendar(
  tasks: TodoItem[],
  getListName?: (listId: string) => string | null
): Promise<number> {
  if (Platform.OS === "web" || tasks.length === 0) return 0;

  try {
    if (!(await isCalendarSyncEnabled())) return 0;
    const permission = await checkCalendarPermissions();
    if (!permission.granted) return 0;

    return await withCalendarLock(async () => {
      const [mappings, states] = await Promise.all([getEventMappings(), getEventStates()]);
      let changed = 0;
      for (const task of flattenTasks(tasks)) {
        if (!taskNeedsCalendarReconcile(task, Boolean(mappings[task.id]), states[task.id])) continue;
        await syncTaskUnlocked(task, { listName: getListName?.(task.listId) ?? null });
        changed++;
      }
      return changed;
    });
  } catch (error) {
    console.error("Failed to reconcile tasks with native calendar:", error);
    return 0;
  }
}

/**
 * IDs of lists that have tasks with a synced event (or one that may need restoring),
 * so the app knows which lists to refresh to catch outside changes.
 */
export async function getListIdsWithSyncedEvents(): Promise<string[]> {
  const [mappings, states] = await Promise.all([getEventMappings(), getEventStates()]);
  const ids = new Set<string>();
  for (const [taskId, state] of Object.entries(states)) {
    if (!state.listId) continue;
    if (mappings[taskId] || state.deletedOnComplete) ids.add(state.listId);
  }
  return [...ids];
}

import { Platform } from "react-native";
import * as Calendar from "expo-calendar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TodoItem } from "../shared";

const CALENDAR_SYNC_ENABLED_KEY = "@synx_calendar_sync_enabled";
const SYNX_CALENDAR_ID_KEY = "@synx_calendar_id";
const EVENT_MAPPINGS_KEY = "@synx_calendar_event_mappings";

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

const SYNX_CALENDAR_TITLE = "sYnX Tasks";
const SYNX_CALENDAR_COLOR = "#6366F1";

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
 * Get existing "sYnX Tasks" calendar or create a new dedicated calendar.
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
 * Sync a single task to the device's native calendar.
 * If task has no reminderAt or is completed, any existing synced native event will be removed.
 */
export async function syncTaskToNativeCalendar(task: TodoItem): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const enabled = await isCalendarSyncEnabled();
    if (!enabled) return null;

    const mappings = await getEventMappings();
    const existingEventId = mappings[task.id];

    // If task has no reminder date/time or is completed, remove synced event if it exists
    if (!task.reminderAt || task.completed) {
      if (existingEventId) {
        await removeTaskFromNativeCalendar(task.id);
      }
      return null;
    }

    const calendarId = await getOrCreateSynxCalendar();
    if (!calendarId) return null;

    const startDate = new Date(task.reminderAt);
    const durationMs = (task.durationMinutes || 15) * 60 * 1000;
    const endDate = new Date(task.reminderAt + durationMs);

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
      notes: `sYnX Task | Priority: ${(task.priority || "none").toUpperCase()}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    if (existingEventId) {
      try {
        const existingEvent = await Calendar.ExpoCalendarEvent.get(existingEventId);
        // Passing null clears a recurrence that was removed from the task.
        await existingEvent.update({ ...eventDetails, recurrenceRule: recurrenceRule ?? null });
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
    return newEvent.id;
  } catch (error) {
    console.error(`Failed to sync task ${task.id} to native calendar:`, error);
    return null;
  }
}

/**
 * Remove a task's synced event from native device calendar.
 */
export async function removeTaskFromNativeCalendar(taskId: string): Promise<void> {
  if (Platform.OS === "web") return;

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
  } catch (error) {
    console.error(`Failed to remove calendar event for task ${taskId}:`, error);
  }
}

/**
 * Bulk sync all given tasks to the native device calendar.
 */
export async function syncAllTasksToNativeCalendar(tasks: TodoItem[]): Promise<void> {
  if (Platform.OS === "web") return;

  try {
    const calendarId = await getOrCreateSynxCalendar();
    if (!calendarId) return;

    for (const task of tasks) {
      await syncTaskToNativeCalendar(task);
    }
  } catch (error) {
    console.error("Failed bulk sync of tasks to native calendar:", error);
  }
}

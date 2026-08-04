import { Platform } from "react-native";
import * as Calendar from "expo-calendar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TodoItem } from "../shared";

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
  } catch {
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
  } catch {
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
  } catch {
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

/**
 * Check calendar permission status without asking the user.
 */
export async function checkCalendarPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const res = await Calendar.getCalendarPermissionsAsync();
    return res.status === "granted" || res.granted === true;
  } catch {
    return false;
  }
}

/**
 * Request calendar permissions from user.
 */
export async function requestCalendarPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const existing = await Calendar.getCalendarPermissionsAsync();
    if (existing.status === "granted" || existing.granted === true) {
      return true;
    }
    const res = await Calendar.requestCalendarPermissionsAsync();
    return res.status === "granted" || res.granted === true;
  } catch {
    return false;
  }
}

/**
 * Get existing "sYnX Tasks" calendar or create a new dedicated calendar.
 */
export async function getOrCreateSynxCalendar(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const hasPermission = await checkCalendarPermissions();
    if (!hasPermission) {
      const granted = await requestCalendarPermissions();
      if (!granted) return null;
    }

    // Search existing device calendars for "sYnX Tasks" or stored calendar ID
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);

    const storedCalendarId = await AsyncStorage.getItem(SYNX_CALENDAR_ID_KEY);
    if (storedCalendarId) {
      const existing = calendars.find((c) => c.id === storedCalendarId);
      if (existing) {
        return existing.id;
      }
    }

    const existingSynxCalendar = calendars.find(
      (c) => c.title === "sYnX Tasks" || c.name === "sYnX Tasks"
    );
    if (existingSynxCalendar) {
      await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, existingSynxCalendar.id);
      return existingSynxCalendar.id;
    }

    // Create a new "sYnX Tasks" calendar
    if (Platform.OS === "ios") {
      const sources = await Calendar.getSourcesAsync();
      const defaultSource =
        sources.find((s) => s.type === Calendar.SourceType.LOCAL) ||
        sources.find((s) => s.name === "Default" || s.name === "iCloud") ||
        sources[0];

      if (!defaultSource) return null;

      const newCalendarId = await Calendar.createCalendarAsync({
        title: "sYnX Tasks",
        color: "#6366F1",
        entityType: Calendar.EntityTypes.EVENT,
        sourceId: defaultSource.id,
        source: defaultSource,
        name: "sYnX Tasks",
        ownerAccount: "personal",
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
      });

      await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, newCalendarId);
      return newCalendarId;
    } else if (Platform.OS === "android") {
      const newCalendarId = await Calendar.createCalendarAsync({
        title: "sYnX Tasks",
        color: "#6366F1",
        entityType: Calendar.EntityTypes.EVENT,
        name: "sYnX Tasks",
        ownerAccount: "sYnX",
        accessLevel: Calendar.CalendarAccessLevel.OWNER,
        source: {
          isLocalAccount: true,
          name: "sYnX",
          type: Calendar.SourceType.LOCAL,
        },
      });

      await AsyncStorage.setItem(SYNX_CALENDAR_ID_KEY, newCalendarId);
      return newCalendarId;
    }

    return null;
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

    const eventDetails: any = {
      title: task.text,
      startDate,
      endDate,
      notes: `sYnX Task | Priority: ${(task.priority || "none").toUpperCase()}`,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(recurrenceRule ? { recurrenceRule } : {}),
    };

    if (existingEventId) {
      try {
        await Calendar.updateEventAsync(existingEventId, eventDetails);
        return existingEventId;
      } catch {
        // Event might have been deleted manually by user in native Calendar app
      }
    }

    // Create new event
    const newEventId = await Calendar.createEventAsync(calendarId, eventDetails);
    mappings[task.id] = newEventId;
    await saveEventMappings(mappings);
    return newEventId;
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
        await Calendar.deleteEventAsync(eventId);
      } catch {
        // Ignore if already deleted from native calendar
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

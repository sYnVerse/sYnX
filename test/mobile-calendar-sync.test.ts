import { describe, it, expect, vi, beforeEach } from "vitest";

// Exercises mobile/src/services/calendar.ts against a mock of the expo-calendar 58 API.
// The service resolves its dependencies from mobile/node_modules (install mobile deps first),
// so each module is mocked by that path as well as by its bare name.

const { storage, platform, asyncStorageModule, reactNativeModule } = vi.hoisted(() => {
  // In-memory AsyncStorage
  const storage = new Map<string, string>();
  const platform = { OS: "android" as string };
  return {
    storage,
    platform,
    asyncStorageModule: {
      default: {
        getItem: async (k: string) => (storage.has(k) ? storage.get(k)! : null),
        setItem: async (k: string, v: string) => {
          storage.set(k, v);
        },
      },
    },
    reactNativeModule: { Platform: platform },
  };
});
vi.mock("@react-native-async-storage/async-storage", () => asyncStorageModule);
vi.mock("../mobile/node_modules/@react-native-async-storage/async-storage", () => asyncStorageModule);
vi.mock("react-native", () => reactNativeModule);
vi.mock("../mobile/node_modules/react-native", () => reactNativeModule);

const cal = vi.hoisted(() => {
  const state = {
    permission: { status: "undetermined", granted: false, canAskAgain: true, expires: "never" } as any,
    requestResult: { status: "granted", granted: true, canAskAgain: true, expires: "never" } as any,
    calendars: [] as any[],
    events: new Map<string, any>(),
    nextId: 1,
  };
  const getCalendarPermissions = vi.fn(async () => state.permission);
  const requestCalendarPermissions = vi.fn(async () => {
    state.permission = state.requestResult;
    return state.requestResult;
  });
  const makeCalendar = (id: string, title: string) => ({
    id,
    title,
    name: title,
    source: { id: "src", name: "Default", type: "local" },
    createEvent: vi.fn(async (details: any) => {
      const eventId = `evt-${state.nextId++}`;
      const event = {
        id: eventId,
        ...details,
        update: vi.fn(async (d: any) => Object.assign(event, d)),
        delete: vi.fn(async () => {
          state.events.delete(eventId);
        }),
      };
      state.events.set(eventId, event);
      return event;
    }),
  });
  const getCalendars = vi.fn(async () => state.calendars);
  const createCalendar = vi.fn(async (details: any) => {
    const c = makeCalendar(`cal-${state.nextId++}`, details.title);
    state.calendars.push(c);
    return c;
  });
  const ExpoCalendar = {
    get: vi.fn(async (id: string) => {
      const c = state.calendars.find((x) => x.id === id);
      if (!c) throw new Error("Calendar not found");
      return c;
    }),
  };
  const ExpoCalendarEvent = {
    get: vi.fn(async (id: string) => {
      const e = state.events.get(id);
      if (!e) throw new Error("Event not found");
      return e;
    }),
  };
  const legacyAsync = vi.fn(async () => {
    throw new Error("legacy *Async API called");
  });
  return {
    state,
    makeCalendar,
    module: {
      getCalendarPermissions,
      requestCalendarPermissions,
      getCalendars,
      createCalendar,
      getSourcesSync: vi.fn(() => [{ id: "src", name: "Default", type: "local" }]),
      ExpoCalendar,
      ExpoCalendarEvent,
      EntityTypes: { EVENT: "event" },
      SourceType: { LOCAL: "local" },
      CalendarAccessLevel: { OWNER: "owner" },
      Frequency: { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly" },
      // Legacy functions throw at runtime in expo-calendar 58
      getCalendarPermissionsAsync: legacyAsync,
      requestCalendarPermissionsAsync: legacyAsync,
      getCalendarsAsync: legacyAsync,
      createCalendarAsync: legacyAsync,
      getSourcesAsync: legacyAsync,
      createEventAsync: legacyAsync,
      updateEventAsync: legacyAsync,
      deleteEventAsync: legacyAsync,
    },
  };
});
vi.mock("expo-calendar", () => cal.module);
vi.mock("../mobile/node_modules/expo-calendar", () => cal.module);

import {
  checkCalendarPermissions,
  requestCalendarPermissions,
  describeCalendarPermission,
  getOrCreateSynxCalendar,
  setCalendarSyncEnabled,
  syncTaskToNativeCalendar,
  removeTaskFromNativeCalendar,
} from "../mobile/src/services/calendar";

const MAPPINGS_KEY = "@synx_calendar_event_mappings";
const CAL_ID_KEY = "@synx_calendar_id";

function grant() {
  cal.state.permission = { status: "granted", granted: true, canAskAgain: true, expires: "never" };
}

function task(overrides: Record<string, unknown> = {}): any {
  return {
    id: "t1",
    text: "Write report",
    completed: false,
    reminderAt: Date.UTC(2026, 9, 26, 17, 0),
    durationMinutes: 30,
    priority: "high",
    recurrence: "none",
    ...overrides,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  storage.clear();
  platform.OS = "android";
  cal.state.permission = { status: "undetermined", granted: false, canAskAgain: true, expires: "never" };
  cal.state.requestResult = { status: "granted", granted: true, canAskAgain: true, expires: "never" };
  cal.state.calendars = [];
  cal.state.events.clear();
  cal.state.nextId = 1;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("device calendar permissions (expo-calendar 58)", () => {
  it("reports granted access", async () => {
    grant();
    const res = await checkCalendarPermissions();
    expect(res).toEqual({ granted: true, status: "granted", canAskAgain: true });
    expect(describeCalendarPermission(res)).toBe("Granted");
  });

  it("shows the OS dialog when not granted and the OS can still ask", async () => {
    const res = await requestCalendarPermissions();
    expect(cal.module.requestCalendarPermissions).toHaveBeenCalledTimes(1);
    expect(res.granted).toBe(true);
  });

  it("returns denied with canAskAgain true when the user dismisses the dialog", async () => {
    cal.state.requestResult = { status: "denied", granted: false, canAskAgain: true, expires: "never" };
    const res = await requestCalendarPermissions();
    expect(res).toEqual({ granted: false, status: "denied", canAskAgain: true });
    expect(describeCalendarPermission(res)).toBe("Not Granted");
  });

  it("does not ask again when the OS has blocked the dialog (send user to settings)", async () => {
    cal.state.permission = { status: "denied", granted: false, canAskAgain: false, expires: "never" };
    const res = await requestCalendarPermissions();
    expect(cal.module.requestCalendarPermissions).not.toHaveBeenCalled();
    expect(res).toEqual({ granted: false, status: "denied", canAskAgain: false });
    expect(describeCalendarPermission(res)).toBe("Denied");
  });

  it("logs and reports unavailable when the permission call throws", async () => {
    cal.module.getCalendarPermissions.mockRejectedValueOnce(new Error("boom"));
    const res = await checkCalendarPermissions();
    expect(res.status).toBe("unavailable");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("never calls the legacy *Async functions", async () => {
    grant();
    await setCalendarSyncEnabled(true);
    await syncTaskToNativeCalendar(task());
    await syncTaskToNativeCalendar(task({ text: "Updated" }));
    await removeTaskFromNativeCalendar("t1");
    for (const name of [
      "getCalendarPermissionsAsync",
      "requestCalendarPermissionsAsync",
      "getCalendarsAsync",
      "createCalendarAsync",
      "getSourcesAsync",
      "createEventAsync",
      "updateEventAsync",
      "deleteEventAsync",
    ] as const) {
      expect(cal.module[name]).not.toHaveBeenCalled();
    }
  });
});

describe("sYnX Tasks calendar find/create", () => {
  it("returns null without creating anything when access is denied", async () => {
    cal.state.permission = { status: "denied", granted: false, canAskAgain: false, expires: "never" };
    expect(await getOrCreateSynxCalendar()).toBeNull();
    expect(cal.module.createCalendar).not.toHaveBeenCalled();
  });

  it("reuses an existing sYnX Tasks calendar and stores its id", async () => {
    grant();
    cal.state.calendars = [cal.makeCalendar("other", "Work"), cal.makeCalendar("existing", "sYnX Tasks")];
    expect(await getOrCreateSynxCalendar()).toBe("existing");
    expect(storage.get(CAL_ID_KEY)).toBe("existing");
    expect(cal.module.createCalendar).not.toHaveBeenCalled();
  });

  it("creates a local calendar on Android and stores its id", async () => {
    grant();
    const id = await getOrCreateSynxCalendar();
    expect(id).toBe("cal-1");
    expect(storage.get(CAL_ID_KEY)).toBe("cal-1");
    const details = cal.module.createCalendar.mock.calls[0][0];
    expect(details.source).toEqual({ isLocalAccount: true, name: "sYnX", type: "local" });
    expect(cal.module.getSourcesSync).not.toHaveBeenCalled();
  });

  it("creates the calendar on iOS from a device source", async () => {
    platform.OS = "ios";
    grant();
    await getOrCreateSynxCalendar();
    const details = cal.module.createCalendar.mock.calls[0][0];
    expect(details.sourceId).toBe("src");
    expect(cal.module.getSourcesSync).toHaveBeenCalled();
  });
});

describe("task event create/update/delete", () => {
  beforeEach(async () => {
    grant();
    await setCalendarSyncEnabled(true);
  });

  it("creates an event and stores the task -> event mapping", async () => {
    const id = await syncTaskToNativeCalendar(task({ recurrence: "weekly" }));
    expect(id).toBe("evt-2");
    expect(JSON.parse(storage.get(MAPPINGS_KEY)!)).toEqual({ t1: "evt-2" });
    const event = cal.state.events.get("evt-2");
    expect(event.title).toBe("Write report");
    expect(event.recurrenceRule).toEqual({ frequency: "weekly" });
    expect(event.endDate.getTime() - event.startDate.getTime()).toBe(30 * 60 * 1000);
  });

  it("updates the existing event in place", async () => {
    const id = await syncTaskToNativeCalendar(task());
    const again = await syncTaskToNativeCalendar(task({ text: "Renamed" }));
    expect(again).toBe(id);
    const event = cal.state.events.get(id!);
    expect(event.update).toHaveBeenCalledTimes(1);
    expect(event.title).toBe("Renamed");
    expect(event.recurrenceRule).toBeNull();
  });

  it("recreates the event when the mapped one was deleted in the calendar app", async () => {
    storage.set(MAPPINGS_KEY, JSON.stringify({ t1: "gone" }));
    const id = await syncTaskToNativeCalendar(task());
    expect(id).not.toBe("gone");
    expect(JSON.parse(storage.get(MAPPINGS_KEY)!)).toEqual({ t1: id });
    expect(warnSpy).toHaveBeenCalled();
  });

  it("deletes the event when the task is completed", async () => {
    const id = await syncTaskToNativeCalendar(task());
    await syncTaskToNativeCalendar(task({ completed: true }));
    expect(cal.state.events.has(id!)).toBe(false);
    expect(JSON.parse(storage.get(MAPPINGS_KEY)!)).toEqual({});
  });

  it("drops the mapping even if the event is already gone", async () => {
    storage.set(MAPPINGS_KEY, JSON.stringify({ t1: "gone", t2: "keep" }));
    await removeTaskFromNativeCalendar("t1");
    expect(JSON.parse(storage.get(MAPPINGS_KEY)!)).toEqual({ t2: "keep" });
    expect(warnSpy).toHaveBeenCalled();
  });
});

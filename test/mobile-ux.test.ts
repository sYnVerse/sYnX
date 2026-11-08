import { describe, expect, it } from "vitest";
import SettingsScreenSource from "../mobile/src/screens/SettingsScreen.tsx?raw";
import TaskModalSource from "../mobile/src/components/TaskModal.tsx?raw";
import TaskBreakdownModalSource from "../mobile/src/components/TaskBreakdownModal.tsx?raw";
import ListsScreenSource from "../mobile/src/screens/ListsScreen.tsx?raw";
import TasksScreenSource from "../mobile/src/screens/TasksScreen.tsx?raw";
import TaskRowSource from "../mobile/src/components/TaskRow.tsx?raw";
import SubtaskEditModalSource from "../mobile/src/components/SubtaskEditModal.tsx?raw";
import ListOptionsModalSource from "../mobile/src/components/ListOptionsModal.tsx?raw";
import EditListModalSource from "../mobile/src/components/EditListModal.tsx?raw";
import ShareListModalSource from "../mobile/src/components/ShareListModal.tsx?raw";
import ListRowSource from "../mobile/src/components/ListRow.tsx?raw";
import ThemeContextSource from "../mobile/src/context/ThemeContext.tsx?raw";
import SkeletonLoaderSource from "../mobile/src/components/SkeletonLoader.tsx?raw";
import CalendarAccessSoftAskSource from "../mobile/src/components/CalendarAccessSoftAsk.tsx?raw";
import CalendarPickerModalSource from "../mobile/src/components/CalendarPickerModal.tsx?raw";
import ChangelogModalSource from "../mobile/src/components/ChangelogModal.tsx?raw";
import PhoneCarrierPickerModalSource from "../mobile/src/components/PhoneCarrierPickerModal.tsx?raw";
import {
  SOFT_ASK_REASK_MS,
  evaluateSoftAskPolicy,
  evaluateCalendarSoftAskPolicy,
  mapExpoPermissionToStatus,
  shouldWarnBeforeSharingPrivateList,
  listOwnershipLabel,
  parseSubtaskDurationMinutes,
  getErrorMessage,
  formatFriendlyDate,
  formatReminderTime,
  priorityLabel,
  priorityColor,
  stripLeadingCategoryEmoji,
  buildCategorizedListName,
  contrastRatio,
  FLOATING_TAB_BAR_HEIGHT,
  getFabBottomOffset,
  getListBottomPadding,
  getSheetBottomPadding,
  getTabScreenBottomPadding,
  derivePushSettingsState,
  deriveCalendarSettingsState,
  resolveThemeMode,
} from "../shared/mobile-ux";
import { MOBILE_APP_VERSION, MOBILE_VERSION } from "../shared/mobile-version";

describe("evaluateSoftAskPolicy", () => {
  const base = {
    declinedAt: null as number | null,
    contextualReminderNudged: false,
    now: 1_000_000_000_000,
  };

  it("never shows when permission is granted or blocked", () => {
    expect(
      evaluateSoftAskPolicy({ ...base, permission: "granted" })
    ).toBe(false);
    expect(
      evaluateSoftAskPolicy({ ...base, permission: "blocked" })
    ).toBe(false);
  });

  it("shows on first launch when undetermined and never declined", () => {
    expect(
      evaluateSoftAskPolicy({ ...base, permission: "undetermined" })
    ).toBe(true);
  });

  it("hides after Not now until re-ask window elapses", () => {
    expect(
      evaluateSoftAskPolicy({
        ...base,
        permission: "undetermined",
        declinedAt: base.now! - 1000,
      })
    ).toBe(false);

    expect(
      evaluateSoftAskPolicy({
        ...base,
        permission: "undetermined",
        declinedAt: base.now! - SOFT_ASK_REASK_MS,
      })
    ).toBe(true);
  });

  it("allows one contextual reminder re-ask before the window elapses", () => {
    expect(
      evaluateSoftAskPolicy({
        ...base,
        permission: "denied",
        declinedAt: base.now! - 1000,
        contextualReminder: true,
        contextualReminderNudged: false,
      })
    ).toBe(true);

    expect(
      evaluateSoftAskPolicy({
        ...base,
        permission: "denied",
        declinedAt: base.now! - 1000,
        contextualReminder: true,
        contextualReminderNudged: true,
      })
    ).toBe(false);
  });
});

describe("mapExpoPermissionToStatus", () => {
  it("maps expo statuses including permanently denied → blocked", () => {
    expect(mapExpoPermissionToStatus({ status: "granted" })).toBe("granted");
    expect(mapExpoPermissionToStatus({ status: "undetermined" })).toBe("undetermined");
    expect(mapExpoPermissionToStatus({ status: "denied", canAskAgain: true })).toBe("denied");
    expect(mapExpoPermissionToStatus({ status: "denied", canAskAgain: false })).toBe("blocked");
  });
});

describe("share private warning + ownership label", () => {
  it("warns only for private lists", () => {
    expect(shouldWarnBeforeSharingPrivateList("private")).toBe(true);
    expect(shouldWarnBeforeSharingPrivateList("public_read")).toBe(false);
    expect(shouldWarnBeforeSharingPrivateList("public_edit")).toBe(false);
  });

  it("labels ownership for list header", () => {
    expect(listOwnershipLabel(true)).toBe("Yours");
    expect(listOwnershipLabel(false)).toBe("Shared with you");
    expect(listOwnershipLabel(false, "Chris")).toBe("Shared by Chris");
    expect(listOwnershipLabel(false, "  ")).toBe("Shared with you");
  });
});

describe("parseSubtaskDurationMinutes", () => {
  it("allows clearing (empty → null) and parses digits", () => {
    expect(parseSubtaskDurationMinutes("")).toBeNull();
    expect(parseSubtaskDurationMinutes("   ")).toBeNull();
    expect(parseSubtaskDurationMinutes("1")).toBe(1);
    expect(parseSubtaskDurationMinutes("15")).toBe(15);
    expect(parseSubtaskDurationMinutes("15m")).toBe(15);
  });

  it("returns undefined for non-numeric junk so callers skip save", () => {
    expect(parseSubtaskDurationMinutes("abc")).toBeUndefined();
  });
});

describe("getErrorMessage (mutation error feedback)", () => {
  it("prefers API error payloads then Error.message then fallback", () => {
    expect(
      getErrorMessage({ response: { data: { error: "Nope" } } }, "fallback")
    ).toBe("Nope");
    expect(
      getErrorMessage({ response: { data: { message: "Msg" } } }, "fallback")
    ).toBe("Msg");
    expect(getErrorMessage({ message: "boom" }, "fallback")).toBe("boom");
    expect(getErrorMessage({}, "Couldn't save")).toBe("Couldn't save");
  });
});

describe("date / priority / list name formatting", () => {
  it("formats YYYY-MM-DD as a friendly weekday date", () => {
    expect(formatFriendlyDate("2026-10-22", "en-US")).toBe("Thu, Oct 22");
  });

  it("formats reminder time", () => {
    const ts = new Date(2026, 9, 22, 9, 0, 0).getTime();
    expect(formatReminderTime(ts, "en-US")).toMatch(/9:00/);
  });

  it("maps priority labels and colors", () => {
    expect(priorityLabel("none")).toBe("");
    expect(priorityLabel("high")).toBe("High");
    const theme = {
      danger: "#E11D48",
      accent: "#4F46E5",
      success: "#047857",
      textMuted: "#64748B",
    };
    expect(priorityColor("high", theme)).toBe(theme.danger);
    expect(priorityColor("medium", theme)).toBe("#D97706");
    expect(priorityColor("low", theme)).toBe(theme.success);
    expect(priorityColor("none", theme)).toBe(theme.textMuted);
  });

  it("strips and rebuilds category emoji consistently", () => {
    expect(stripLeadingCategoryEmoji("🎓 French HW", "🎓")).toBe("French HW");
    expect(buildCategorizedListName("🎓", "Study", "French HW")).toBe("🎓 French HW");
    expect(buildCategorizedListName("✏️", "Custom", "Project X")).toBe("Project X");
    expect(buildCategorizedListName("", "", "Uncategorized List")).toBe("Uncategorized List");
    expect(buildCategorizedListName("🚫", "None", "No Category List")).toBe("No Category List");
  });
});

describe("mobile version single source of truth", () => {
  it("exports a valid SemVer and matching display form", () => {
    expect(MOBILE_APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(MOBILE_VERSION).toBe(`v${MOBILE_APP_VERSION}`);
    // Current release for this PR
    expect(MOBILE_APP_VERSION).toBe("3.7.1");
  });
});

describe("theme contrast tokens (WCAG AA text)", () => {
  // Mirrors mobile/src/theme/theme.ts after the contrast fix in this PR
  const light = { bg: "#FAF7F2", surface: "#FFFFFF", textMuted: "#5B6B7C", badgeFg: "#047857" };
  const dark = { bg: "#0F172A", surface: "#1E293B", textMuted: "#94A3B8", badgeFg: "#6EE7B7" };

  it("light muted text meets ~4.5:1 on cream and white", () => {
    expect(contrastRatio(light.textMuted, light.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.textMuted, light.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark muted text meets ~4.5:1 on bg and surface", () => {
    expect(contrastRatio(dark.textMuted, dark.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.textMuted, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("version badge foregrounds beat the old #4ADE80-on-light failure (~1.7:1)", () => {
    expect(contrastRatio(light.badgeFg, light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.badgeFg, dark.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("floating action button and tab bar layout math", () => {
  it("calculates fab bottom offset safely above floating bar across inset heights", () => {
    expect(getFabBottomOffset(0)).toBe(100);
    expect(getFabBottomOffset(28)).toBe(116);
    expect(getFabBottomOffset(34)).toBe(122);
    expect(getFabBottomOffset(48)).toBe(136);
  });

  it("calculates list bottom padding to clear both tab bar and fab", () => {
    expect(getListBottomPadding(0)).toBe(160);
    expect(getListBottomPadding(28)).toBe(176);
    expect(getListBottomPadding(34)).toBe(182);
    expect(getListBottomPadding(48)).toBe(196);
  });

  it("calculates tab screen bottom padding to clear floating tab bar without FAB", () => {
    // 0 insets: FLOATING_TAB_BAR_HEIGHT (72) + Math.max(0, 12) + extra (24) = 108
    expect(getTabScreenBottomPadding(0)).toBe(108);
    expect(getTabScreenBottomPadding(12)).toBe(108);
    // iPhone with home indicator (34px)
    expect(getTabScreenBottomPadding(34)).toBe(130);
    // Android 3-button navigation (48px) — old fixed 110px padding covered bottom 10px of Log Out button
    expect(getTabScreenBottomPadding(48)).toBe(144);
    expect(getTabScreenBottomPadding(48)).toBeGreaterThan(FLOATING_TAB_BAR_HEIGHT + 48);

    // Custom extra clearance
    expect(getTabScreenBottomPadding(0, 16)).toBe(100);
    expect(getTabScreenBottomPadding(48, 76)).toBe(getListBottomPadding(48));
  });

  it("ensures SettingsScreen uses dynamic safe area tab screen bottom padding instead of hardcoded 110", () => {
    expect(SettingsScreenSource).toContain("useSafeAreaInsets");
    expect(SettingsScreenSource).toContain("getTabScreenBottomPadding(insets.bottom)");
    expect(SettingsScreenSource).not.toContain("paddingBottom: 110");
  });

  it("ensures SettingsScreen uses dynamic MOBILE_APP_VERSION fallback for native binary version instead of hardcoded 3.6.0", () => {
    expect(SettingsScreenSource).toContain("updateState.nativeAppVersion || MOBILE_APP_VERSION");
    expect(SettingsScreenSource).not.toContain('updateState.nativeAppVersion || "3.6.0"');
  });

  it("calculates bottom sheet padding to keep buttons above the system navigation bar", () => {
    // 0 insets: preserves base padding (24)
    expect(getSheetBottomPadding(0)).toBe(24);
    // iPhone with home indicator (34px)
    expect(getSheetBottomPadding(34)).toBe(58);
    // Android 3-button navigation (48px)
    expect(getSheetBottomPadding(48)).toBe(72);
    // Clamps negative insets to 0
    expect(getSheetBottomPadding(-10)).toBe(24);
    // Custom base padding
    expect(getSheetBottomPadding(48, 16)).toBe(64);
  });

  it("ensures all mobile bottom sheets wire getSheetBottomPadding for system nav clearance", () => {
    expect(TaskModalSource).toContain("getSheetBottomPadding(insets.bottom");
    expect(TaskBreakdownModalSource).toContain("getSheetBottomPadding(insets.bottom");
    expect(ListsScreenSource).toContain("getSheetBottomPadding(insets.bottom");
    expect(TasksScreenSource).toContain("getSheetBottomPadding(insets.bottom");
  });

  it("ensures centered modals use SafeAreaView from react-native-safe-area-context, not react-native", () => {
    for (const [name, source] of [
      ["CalendarPickerModal", CalendarPickerModalSource],
      ["ChangelogModal", ChangelogModalSource],
      ["PhoneCarrierPickerModal", PhoneCarrierPickerModalSource],
    ]) {
      expect(source, `${name} must import SafeAreaView from react-native-safe-area-context`).toContain(
        'from "react-native-safe-area-context"'
      );
      expect(source, `${name} must not import SafeAreaView from react-native`).not.toMatch(
        /import\s+[^}]*SafeAreaView[^}]*\s+from\s+["']react-native["']/
      );
    }
  });
});

describe("derivePushSettingsState (#133)", () => {
  it("keeps push enabled and active when granted and stored", () => {
    expect(
      derivePushSettingsState({
        permission: "granted",
        hasStoredToken: true,
        userDisabled: false,
      })
    ).toEqual({
      pushEnabled: true,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: false,
      statusLabel: "On",
    });
  });

  it("requests auto-registration when granted but token is missing", () => {
    expect(
      derivePushSettingsState({
        permission: "granted",
        hasStoredToken: false,
        userDisabled: false,
      })
    ).toEqual({
      pushEnabled: true,
      shouldAutoRegister: true,
      shouldUnregisterStaleToken: false,
      statusLabel: "On",
    });
  });

  it("respects user opt-out and does NOT auto-register when user toggled push off", () => {
    expect(
      derivePushSettingsState({
        permission: "granted",
        hasStoredToken: false,
        userDisabled: true,
      })
    ).toEqual({
      pushEnabled: false,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: false,
      statusLabel: "Off",
    });

    expect(
      derivePushSettingsState({
        permission: "granted",
        hasStoredToken: true,
        userDisabled: true,
      })
    ).toEqual({
      pushEnabled: false,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: false,
      statusLabel: "Off",
    });
  });

  it("detects permission revoked in system settings and flags stale token for unregistration", () => {
    expect(
      derivePushSettingsState({
        permission: "blocked",
        hasStoredToken: true,
        userDisabled: false,
      })
    ).toEqual({
      pushEnabled: false,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: true,
      statusLabel: "Blocked in system settings",
    });

    expect(
      derivePushSettingsState({
        permission: "denied",
        hasStoredToken: true,
        userDisabled: false,
      })
    ).toEqual({
      pushEnabled: false,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: true,
      statusLabel: "Off",
    });
  });

  it("handles undetermined status cleanly", () => {
    expect(
      derivePushSettingsState({
        permission: "undetermined",
        hasStoredToken: false,
        userDisabled: false,
      })
    ).toEqual({
      pushEnabled: false,
      shouldAutoRegister: false,
      shouldUnregisterStaleToken: false,
      statusLabel: "Not set up",
    });
  });
});

describe("deriveCalendarSettingsState (#133)", () => {
  it("flags warning when sync is enabled but permission is revoked in OS settings", () => {
    expect(
      deriveCalendarSettingsState({
        syncEnabled: true,
        permissionGranted: false,
      })
    ).toEqual({
      isWarningVisible: true,
      canSync: false,
    });
  });

  it("shows healthy sync state when sync is enabled and permission is granted", () => {
    expect(
      deriveCalendarSettingsState({
        syncEnabled: true,
        permissionGranted: true,
      })
    ).toEqual({
      isWarningVisible: false,
      canSync: true,
    });
  });

  it("shows no warning when sync is turned off, regardless of permission", () => {
    expect(
      deriveCalendarSettingsState({
        syncEnabled: false,
        permissionGranted: false,
      })
    ).toEqual({
      isWarningVisible: false,
      canSync: false,
    });

    expect(
      deriveCalendarSettingsState({
        syncEnabled: false,
        permissionGranted: true,
      })
    ).toEqual({
      isWarningVisible: false,
      canSync: false,
    });
  });
});

describe("SettingsScreen permission synchronization source guards (#133)", () => {
  it("guards user push opt-out persistence and permission reconciliation", () => {
    expect(SettingsScreenSource).toContain("setPushDisabledByUser(true)");
    expect(SettingsScreenSource).toContain("setPushDisabledByUser(false)");
    expect(SettingsScreenSource).toContain("isPushDisabledByUser()");
    expect(SettingsScreenSource).toContain("derivePushSettingsState");
    expect(SettingsScreenSource).toContain("deriveCalendarSettingsState");
  });

  it("re-checks push state in the foreground AppState listener", () => {
    expect(SettingsScreenSource).toMatch(/AppState\.addEventListener\("change",[^}]*refreshPushState/);
  });

  it("renders a clear warning and action when calendar sync is on without permission", () => {
    expect(SettingsScreenSource).toContain("Calendar access is off in system settings");
    expect(SettingsScreenSource).toContain("Linking.openSettings()");
    expect(SettingsScreenSource).toContain("handleToggleCalendarSync(false)");
  });
});

describe("TaskRow reminder date alongside time (#111)", () => {
  it("uses formatReminderPillLabel to display date and time on task cards", () => {
    expect(TaskRowSource).toContain("formatReminderPillLabel");
    expect(TaskRowSource).toContain("formatReminderPillLabel(item.reminderAt)");
    expect(TaskRowSource).not.toMatch(/formatReminderTime\(item\.reminderAt\)/);
  });

  it("guards against rendering reminder badges for tasks without reminders", () => {
    expect(TaskRowSource).toContain("item.reminderAt ? (");
  });
});

describe("evaluateCalendarSoftAskPolicy (#134)", () => {
  const now = 1_000_000_000_000;

  it("never shows when sync is disabled or permission is already granted", () => {
    expect(
      evaluateCalendarSoftAskPolicy({
        syncEnabled: false,
        permissionGranted: false,
        declinedAt: null,
        now,
      })
    ).toBe(false);

    expect(
      evaluateCalendarSoftAskPolicy({
        syncEnabled: true,
        permissionGranted: true,
        declinedAt: null,
        now,
      })
    ).toBe(false);

    expect(
      evaluateCalendarSoftAskPolicy({
        syncEnabled: false,
        permissionGranted: true,
        declinedAt: null,
        now,
      })
    ).toBe(false);
  });

  it("shows when sync is on, permission is not granted, and never declined", () => {
    expect(
      evaluateCalendarSoftAskPolicy({
        syncEnabled: true,
        permissionGranted: false,
        declinedAt: null,
        now,
      })
    ).toBe(true);
  });

  it("hides after tapping Not now until 14-day back-off elapses", () => {
    expect(
      evaluateCalendarSoftAskPolicy({
        syncEnabled: true,
        permissionGranted: false,
        declinedAt: now - 1000,
        now,
      })
    ).toBe(false);

    expect(
      evaluateCalendarSoftAskPolicy({
        syncEnabled: true,
        permissionGranted: false,
        declinedAt: now - SOFT_ASK_REASK_MS + 1,
        now,
      })
    ).toBe(false);

    expect(
      evaluateCalendarSoftAskPolicy({
        syncEnabled: true,
        permissionGranted: false,
        declinedAt: now - SOFT_ASK_REASK_MS,
        now,
      })
    ).toBe(true);
  });
});

describe("CalendarAccessSoftAsk component source guards (#134)", () => {
  it("includes Turn on, Turn off calendar sync, and Not now actions", () => {
    expect(CalendarAccessSoftAskSource).toContain("Turn on");
    expect(CalendarAccessSoftAskSource).toContain("Turn off calendar sync");
    expect(CalendarAccessSoftAskSource).toContain("Not now");
    expect(CalendarAccessSoftAskSource).toContain("Calendar sync is turned on in sYnX");
  });
});

describe("Task and Subtask Redesign (#158, #156, #157)", () => {
  describe("TaskRow (#158)", () => {
    it("renders a 4px colored priority edge stripe instead of a pill badge", () => {
      expect(TaskRowSource).toContain("borderLeftWidth: hasPriorityStripe ? 4 : 1");
      expect(TaskRowSource).toContain("hasPriorityStripe ? priorityColor(prio, theme) : theme.cardBorder");
      // Flag pill badge has been removed from badge row
      expect(TaskRowSource).not.toMatch(/priorityLabel\(prio\)/);
    });

    it("triggers onEdit when card body is tapped", () => {
      expect(TaskRowSource).toContain("onPress={() => onEdit(item)}");
      expect(TaskRowSource).toContain('accessibilityLabel={`Edit task ${item.text}`}');
    });

    it("removes pencil and trash buttons from the task card, replacing with '+' subtask action", () => {
      expect(TaskRowSource).not.toContain("<Pencil");
      expect(TaskRowSource).not.toContain("<Trash2");
      expect(TaskRowSource).toContain("<Plus");
      expect(TaskRowSource).toContain("onOpenSubtasks(item)");
      expect(TaskRowSource).toContain('accessibilityLabel={`Add or manage subtasks for ${item.text}`}');
    });

    it("renders interactive subtask count chip when subtasks exist", () => {
      expect(TaskRowSource).toContain("subtaskCount > 0 &&");
      expect(TaskRowSource).toContain("completedSubtasks}/{subtaskCount} subtasks");
      expect(TaskRowSource).toContain("onOpenSubtasks(item)");
    });
  });

  describe("TaskModal Delete Action (#158)", () => {
    it("renders destructive Delete Task button with Trash2 icon when editing", () => {
      expect(TaskModalSource).toContain("isEditing && onDelete");
      expect(TaskModalSource).toContain("<Trash2");
      expect(TaskModalSource).toContain("Delete Task");
      expect(TaskModalSource).toContain('accessibilityLabel="Delete task"');
    });
  });

  describe("TaskBreakdownModal (#156, #157)", () => {
    it("wraps subtask titles multiline without single-line ellipsis truncation", () => {
      expect(TaskBreakdownModalSource).toContain("subtaskContent");
      expect(TaskBreakdownModalSource).toContain("subtaskText");
      expect(TaskBreakdownModalSource).not.toMatch(/numberOfLines=\{1\}/);
    });

    it("replaces inline duration text inputs with pencil edit action", () => {
      // Inline minsInput removed from subtask rows
      expect(TaskBreakdownModalSource).not.toContain("minsInputWrapper");
      expect(TaskBreakdownModalSource).not.toContain("minsInputAdd");
      // Pencil icon button present for editing subtasks
      expect(TaskBreakdownModalSource).toContain("<Pencil");
      expect(TaskBreakdownModalSource).toContain("setEditingSubtask(st)");
      expect(TaskBreakdownModalSource).toContain("SubtaskEditModal");
    });

    it("renders compact read-only duration badge only when duration is set", () => {
      expect(TaskBreakdownModalSource).toContain("st.durationMinutes != null && st.durationMinutes > 0 ? (");
      expect(TaskBreakdownModalSource).toContain("{st.durationMinutes}m");
    });

    it("defaults new subtask duration to null without hardcoded 5", () => {
      expect(TaskBreakdownModalSource).toContain("durationMinutes: null");
      expect(TaskBreakdownModalSource).not.toContain('useState("5")');
      expect(TaskBreakdownModalSource).not.toContain('placeholder="5"');
    });

    it("accurately sums positive durations and ignores null durations in parent total", () => {
      expect(TaskBreakdownModalSource).toContain(
        "return sum + (typeof mins === \"number\" && !isNaN(mins) && mins > 0 ? mins : 0);"
      );
    });
  });

  describe("SubtaskEditModal (#157)", () => {
    it("renders title input, optional duration input, cancel and save buttons", () => {
      expect(SubtaskEditModalSource).toContain("Edit Subtask");
      expect(SubtaskEditModalSource).toContain("Subtask title");
      expect(SubtaskEditModalSource).toContain("Duration (minutes, optional)");
      expect(SubtaskEditModalSource).toContain("Cancel");
      expect(SubtaskEditModalSource).toContain("Save");
      expect(SubtaskEditModalSource).toContain("parseSubtaskDurationMinutes(durationText)");
    });
  });

  describe("TasksScreen Header & Default Values (#158)", () => {
    it("renders header pencil icon opening ListOptionsModal", () => {
      expect(TasksScreenSource).toContain("ListOptionsModal");
      expect(TasksScreenSource).toContain("setShowListOptionsModal(true)");
      expect(TasksScreenSource).toContain('accessibilityLabel={`List options for ${listMeta.name}`}');
    });

    it("renders icon-only switch button without 'Switch' text", () => {
      expect(TasksScreenSource).toContain("<FolderKanban");
      expect(TasksScreenSource).not.toContain('<Text style={[styles.switchListText');
      expect(TasksScreenSource).not.toContain(">Switch<");
    });

    it("hides 'Yours' ownership subtitle when user is the list owner", () => {
      expect(TasksScreenSource).toContain("!isOwner && ownershipLabel ? (");
    });

    it("hides ListPermissionBanner when shareMode is private", () => {
      expect(TasksScreenSource).toContain('listMeta && shareMode !== "private" ? (');
    });

    it("renders expandable search bar on demand via search icon", () => {
      expect(TasksScreenSource).toContain("searchVisible ? (");
      expect(TasksScreenSource).toContain("setSearchVisible");
    });
  });

  describe("ListOptionsModal (#158)", () => {
    it("renders Pin to widget, Share, Edit details, and Delete list", () => {
      expect(ListOptionsModalSource).toContain("Pin to widget");
      expect(ListOptionsModalSource).toContain("Unpin from widget");
      expect(ListOptionsModalSource).toContain("Share list access");
      expect(ListOptionsModalSource).toContain("Edit list details");
      expect(ListOptionsModalSource).toContain("Delete list");
    });
  });
});

describe("Theme Mode Resolution and Background Refresh (#176)", () => {
  it("resolves mode according to user preference and system scheme", () => {
    expect(resolveThemeMode("light", "dark")).toBe("light");
    expect(resolveThemeMode("dark", "light")).toBe("dark");
    expect(resolveThemeMode("system", "light")).toBe("light");
    expect(resolveThemeMode("system", "dark")).toBe("dark");
    expect(resolveThemeMode("system", null)).toBe("dark");
    expect(resolveThemeMode("system", undefined)).toBe("dark");
  });

  it("ThemeContext subscribes to Appearance and AppState foreground transitions", () => {
    expect(ThemeContextSource).toContain("Appearance.addChangeListener");
    expect(ThemeContextSource).toContain('AppState.addEventListener("change"');
    expect(ThemeContextSource).toContain('nextState === "active"');
    expect(ThemeContextSource).toContain("resolveThemeMode");
  });

  it("SkeletonLoader checks resolvedMode instead of themeMode", () => {
    expect(SkeletonLoaderSource).toContain("resolvedMode === \"light\"");
    expect(SkeletonLoaderSource).not.toContain("themeMode === \"light\"");
  });
});

describe("List Card Single Border and Solid Surface (#180)", () => {
  it("ListRow renders clean single border with solid card surface and no elevation", () => {
    expect(ListRowSource).toContain("backgroundColor: isActive ? theme.cardActiveBg : theme.cardBg");
    expect(ListRowSource).not.toContain("elevation");
    expect(ListRowSource).not.toContain("shadowOffset");
    expect(ListRowSource).not.toContain("shadowOpacity");
    expect(ListRowSource).not.toContain("${theme.accent}0D");
  });
});

describe("TasksScreen List Options Direct Actions and Extracted Modals (#182)", () => {
  it("TasksScreen opens EditListModal and ShareListModal in place instead of navigating to Lists tab", () => {
    expect(TasksScreenSource).toContain("EditListModal");
    expect(TasksScreenSource).toContain("ShareListModal");
    expect(TasksScreenSource).toContain("setShowEditListModal(true)");
    expect(TasksScreenSource).toContain("setShowShareListModal(true)");
    expect(TasksScreenSource).not.toContain("onShareAccess={onSwitchLists}");
    expect(TasksScreenSource).not.toContain("onEditDetails={onSwitchLists}");
  });

  it("ListOptionsModal defers action callbacks after modal dismiss", () => {
    expect(ListOptionsModalSource).toContain("closeThen");
    expect(ListOptionsModalSource).toContain("closeThen(onShareAccess)");
    expect(ListOptionsModalSource).toContain("closeThen(onEditDetails)");
    expect(ListOptionsModalSource).toContain("closeThen(onDeleteList)");
  });

  it("TasksScreen onDeleteList handles collaborative pending approval and unpinning", () => {
    expect(TasksScreenSource).toContain("pendingApproval");
    expect(TasksScreenSource).toContain("setPinnedWidgetConfig(null)");
  });

  it("EditListModal and ShareListModal are standalone reusable components", () => {
    expect(EditListModalSource).toContain("export const EditListModal");
    expect(ShareListModalSource).toContain("export const ShareListModal");
  });
});


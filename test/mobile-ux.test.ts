import { describe, expect, it } from "vitest";
import {
  SOFT_ASK_REASK_MS,
  evaluateSoftAskPolicy,
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
  getFabBottomOffset,
  getListBottomPadding,
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
  });
});

describe("mobile version single source of truth", () => {
  it("exports a valid SemVer and matching display form", () => {
    expect(MOBILE_APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(MOBILE_VERSION).toBe(`v${MOBILE_APP_VERSION}`);
    // Current release for this PR
    expect(MOBILE_APP_VERSION).toBe("3.4.2");
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
  });
});

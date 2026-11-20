import { describe, it, expect } from "vitest";
import { computeQuickAddFormState } from "../mobile/src/utils/quickAddForm";

// 2026-11-16 10:00:00 UTC (same wall clock as UTC timezone)
const NOV_16_10AM_UTC = Date.UTC(2026, 10, 16, 10, 0, 0, 0);

describe("mobile quick add form helper (#100)", () => {
  it("parses date, priority, recurrence, and duration in create mode with dismissible chips", () => {
    const state = computeQuickAddFormState({
      text: "Pay rent tomorrow at 3pm weekly for 20m !high",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
    });

    expect(state.effectiveTitle).toBe("Pay rent");
    expect(state.effectivePriority).toBe("high");
    expect(state.effectiveRecurrence).toBe("weekly");
    expect(state.effectiveDurationText).toBe("20");
    expect(state.hasParsedReminder).toBe(true);
    expect(state.reminderTouchedEffective).toBe(true);
    expect(state.resolveEffectiveReminderAt(NOV_16_10AM_UTC)).toBe(
      Date.UTC(2026, 10, 17, 15, 0, 0, 0)
    );

    expect(state.chips.map((c) => c.kind)).toEqual([
      "date",
      "recurrence",
      "duration",
      "priority",
    ]);
    expect(state.chips.find((c) => c.kind === "priority")?.label).toBe("🔴 High");
    expect(state.chips.find((c) => c.kind === "recurrence")?.label).toBe("🔁 Weekly");
    expect(state.chips.find((c) => c.kind === "duration")?.label).toBe("⏱ 20m");
  });

  it("applies baseDay in Calendar create mode and lets explicit dates override baseDay", () => {
    const timed = computeQuickAddFormState({
      text: "2pm standup",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      baseDay: "2026-11-18",
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
      initialReminderAt: Date.UTC(2026, 10, 18, 9, 0, 0, 0),
    });

    expect(timed.effectiveTitle).toBe("standup");
    expect(timed.hasParsedReminder).toBe(true);
    expect(timed.resolveEffectiveReminderAt(NOV_16_10AM_UTC)).toBe(
      Date.UTC(2026, 10, 18, 14, 0, 0, 0)
    );

    const explicitDay = computeQuickAddFormState({
      text: "tomorrow 10am Dentist",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      baseDay: "2026-11-18",
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
      initialReminderAt: Date.UTC(2026, 10, 18, 9, 0, 0, 0),
    });

    expect(explicitDay.effectiveTitle).toBe("Dentist");
    expect(explicitDay.resolveEffectiveReminderAt(NOV_16_10AM_UTC)).toBe(
      Date.UTC(2026, 10, 17, 10, 0, 0, 0)
    );
  });

  it("lets manual overrides win and hides superseded chips while keeping title stripped", () => {
    const state = computeQuickAddFormState({
      text: "Call Mom tomorrow 9am daily for 30m !high",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: "low",
      manualRecurrence: "monthly",
      manualDurationText: "45",
      manualReminder: { kind: "none" },
      initialPriority: "none",
      initialRecurrence: "none",
    });

    expect(state.effectiveTitle).toBe("Call Mom");
    expect(state.effectivePriority).toBe("low");
    expect(state.effectiveRecurrence).toBe("monthly");
    expect(state.effectiveDurationText).toBe("45");
    expect(state.hasParsedReminder).toBe(false);
    expect(state.reminderTouchedEffective).toBe(true);
    expect(state.resolveEffectiveReminderAt(NOV_16_10AM_UTC)).toBeUndefined();
    expect(state.chips).toEqual([]);
  });

  it("restores a dismissed chip phrase back into effectiveTitle", () => {
    const initial = computeQuickAddFormState({
      text: "Read tomorrow !low",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
    });

    const dateChip = initial.chips.find((c) => c.kind === "date");
    expect(dateChip).toBeDefined();

    const afterDismiss = computeQuickAddFormState({
      text: "Read tomorrow !low",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [dateChip!.dismissToken],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
    });

    expect(afterDismiss.effectiveTitle).toBe("Read tomorrow");
    expect(afterDismiss.effectivePriority).toBe("low");
    expect(afterDismiss.hasParsedReminder).toBe(false);
    expect(afterDismiss.reminderTouchedEffective).toBe(false);
    expect(afterDismiss.chips.map((c) => c.kind)).toEqual(["priority"]);
  });

  it("skips parsing completely in edit mode or when smartEnabled is false", () => {
    const editState = computeQuickAddFormState({
      text: "Pay rent tomorrow !high weekly 20m",
      isEditing: true,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "medium",
      initialRecurrence: "none",
      initialDurationMinutes: 10,
      initialReminderAt: NOV_16_10AM_UTC,
    });

    expect(editState.effectiveTitle).toBe("Pay rent tomorrow !high weekly 20m");
    expect(editState.effectivePriority).toBe("medium");
    expect(editState.effectiveRecurrence).toBe("none");
    expect(editState.effectiveDurationText).toBe("10");
    expect(editState.hasParsedReminder).toBe(false);
    expect(editState.reminderTouchedEffective).toBe(false);
    expect(editState.chips).toEqual([]);
    expect(editState.resolveEffectiveReminderAt(NOV_16_10AM_UTC)).toBe(NOV_16_10AM_UTC);

    const disabledState = computeQuickAddFormState({
      text: "Pay rent tomorrow !high",
      isEditing: false,
      smartEnabled: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
    });

    expect(disabledState.effectiveTitle).toBe("Pay rent tomorrow !high");
    expect(disabledState.effectivePriority).toBe("none");
    expect(disabledState.reminderTouchedEffective).toBe(false);
    expect(disabledState.chips).toEqual([]);
  });

  it("tracks reminderTouchedEffective accurately for parsed vs unparsed titles", () => {
    const noDate = computeQuickAddFormState({
      text: "Buy milk !low",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
    });

    expect(noDate.hasParsedReminder).toBe(false);
    expect(noDate.reminderTouchedEffective).toBe(false);
    expect(noDate.resolveEffectiveReminderAt(NOV_16_10AM_UTC)).toBeUndefined();

    const withDate = computeQuickAddFormState({
      text: "Buy milk tomorrow 9am",
      isEditing: false,
      now: NOV_16_10AM_UTC,
      timeZone: "UTC",
      dismissed: [],
      manualPriority: null,
      manualRecurrence: null,
      manualDurationText: null,
      manualReminder: null,
      initialPriority: "none",
      initialRecurrence: "none",
    });

    expect(withDate.hasParsedReminder).toBe(true);
    expect(withDate.reminderTouchedEffective).toBe(true);
    expect(withDate.resolveEffectiveReminderAt(NOV_16_10AM_UTC)).toBe(
      Date.UTC(2026, 10, 17, 9, 0, 0, 0)
    );
  });
});

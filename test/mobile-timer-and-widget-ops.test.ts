import { describe, it, expect, vi } from "vitest";
import currentListWidgetSource from "../mobile/src/widgets/CurrentListWidget.tsx?raw";
import pinnedListWidgetSource from "../mobile/src/widgets/PinnedListWidget.tsx?raw";
import taskRowSource from "../mobile/src/components/TaskRow.tsx?raw";
import taskModalSource from "../mobile/src/components/TaskModal.tsx?raw";

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn() },
  Platform: { OS: "android" },
}));
vi.mock("../mobile/node_modules/react-native", () => ({
  AppState: { addEventListener: vi.fn() },
  Platform: { OS: "android" },
}));

vi.mock("expo-widgets", () => ({
  addUserInteractionListener: vi.fn(),
  createWidget: vi.fn(() => ({ updateSnapshot: vi.fn(), getSnapshot: vi.fn() })),
}));
vi.mock("../mobile/node_modules/expo-widgets", () => ({
  addUserInteractionListener: vi.fn(),
  createWidget: vi.fn(() => ({ updateSnapshot: vi.fn(), getSnapshot: vi.fn() })),
}));

vi.mock("../mobile/src/widgets/CurrentListWidget", () => ({
  default: { updateSnapshot: vi.fn(), getSnapshot: vi.fn() },
  initialSnapshot: {},
}));

vi.mock("../mobile/src/widgets/PinnedListWidget", () => ({
  default: { updateSnapshot: vi.fn(), getSnapshot: vi.fn() },
  initialSnapshot: {},
}));

vi.mock("../mobile/src/widgets/ListProgressWidget", () => ({
  default: { updateSnapshot: vi.fn(), getSnapshot: vi.fn() },
  initialProgressSnapshot: {},
}));

vi.mock("../mobile/src/services/widgetPreferences", () => ({
  getLastActiveListId: vi.fn(),
  getPinnedWidgetConfig: vi.fn(),
}));

vi.mock("../mobile/src/api/client", () => ({
  apiClient: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
  secureSessionStore: { getAccessToken: vi.fn() },
}));

vi.mock("../mobile/src/services/calendar", () => ({
  reconcileTasksWithNativeCalendar: vi.fn(),
}));

vi.mock("../mobile/src/services/listNames", () => ({
  getCachedListName: vi.fn(),
}));

vi.mock("../mobile/src/services/taskSortPreferences", () => ({
  getTaskSortPreferences: vi.fn(),
  loadTaskSortPreferences: vi.fn(),
  subscribeTaskSortPreferences: vi.fn(),
}));

import { buildWidgetReplayPayload } from "../mobile/src/services/widgetSync";

describe("mobile timer & widget check-off ops (#102)", () => {
  it("builds widget replay payload with completedAt tap timestamp, widget source, and opId", () => {
    expect(
      buildWidgetReplayPayload({
        todoId: "t-1",
        listId: "l-1",
        completed: true,
        at: 1_795_100_000_000,
        opId: "w_t-1_1795100000000_abc",
      })
    ).toEqual({
      completed: true,
      completedAt: 1_795_100_000_000,
      source: "widget",
      opId: "w_t-1_1795100000000_abc",
    });

    expect(
      buildWidgetReplayPayload({
        todoId: "t-2",
        listId: "l-1",
        completed: true,
        at: 1_795_100_001_000,
      })
    ).toEqual({
      completed: true,
      completedAt: 1_795_100_001_000,
      source: "widget",
    });
  });

  it("wires opId worklets, running timer ⏱ badge inside fixed taskTextWidth, and 'widget' directive in both list widgets", () => {
    for (const [name, src] of [
      ["CurrentListWidget", currentListWidgetSource],
      ["PinnedListWidget", pinnedListWidgetSource],
    ] as const) {
      expect(src, `${name} keeps 'widget' directive`).toMatch(/['"]widget['"];/);
      expect(src, `${name} stamps opId in worklet`).toContain("opId");
      expect(src, `${name} renders isRunning indicator`).toContain("task.isRunning");
      expect(src, `${name} keeps fixed width(taskTextWidth)`).toContain("width(taskTextWidth)");
      expect(src, `${name} shows ⏱ badge`).toContain("⏱");
      expect(src, `${name} avoids crypto.randomUUID inside worklet`).not.toContain("randomUUID");
    }
  });

  it("exposes Start/Stop controls in TaskRow and completion stats in TaskModal without regressing TaskRow rules", () => {
    expect(taskRowSource).toContain("Start timer for ${item.text}");
    expect(taskRowSource).toContain("Stop timer for ${item.text}");
    expect(taskRowSource).toContain("formatElapsedTimerLabel");
    expect(taskRowSource).toContain("<Play");
    expect(taskRowSource).not.toContain("<Pencil");
    expect(taskRowSource).not.toContain("<Trash2");

    expect(taskModalSource).toContain("formatTaskCompletionStatsLine");
    expect(taskModalSource).toContain("/completions?limit=20");
    expect(taskModalSource).toContain("todo-completions");
  });

  it("coordinates per-task completion epochs between useSetTodoCompleted and useStartTodo", async () => {
    const useStartTodoSource = (await import("../mobile/src/hooks/useStartTodo.ts?raw")).default;
    const useSetTodoCompletedSource = (
      await import("../mobile/src/hooks/useSetTodoCompleted.ts?raw")
    ).default;
    expect(useSetTodoCompletedSource).toContain("export function bumpTaskCompletionEpoch");
    expect(useSetTodoCompletedSource).toContain("export function getTaskCompletionEpoch");
    expect(useStartTodoSource).toContain("getTaskCompletionEpoch(queryClient, listId, vars.id)");
    expect(useStartTodoSource).toContain("context?.completionEpoch !== getTaskCompletionEpoch");
  });
});

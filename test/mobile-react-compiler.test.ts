import { describe, it, expect } from "vitest";
import appJson from "../mobile/app.json";
import appConfigSource from "../mobile/app.config.js?raw";
import eslintConfigSource from "../mobile/eslint.config.js?raw";
import tasksScreenSource from "../mobile/src/screens/TasksScreen.tsx?raw";
import calendarScreenSource from "../mobile/src/screens/CalendarScreen.tsx?raw";
import listsScreenSource from "../mobile/src/screens/ListsScreen.tsx?raw";
import taskRowSource from "../mobile/src/components/TaskRow.tsx?raw";
import taskModalSource from "../mobile/src/components/TaskModal.tsx?raw";
import taskBreakdownModalSource from "../mobile/src/components/TaskBreakdownModal.tsx?raw";
import subtaskEditModalSource from "../mobile/src/components/SubtaskEditModal.tsx?raw";
import currentListWidgetSource from "../mobile/src/widgets/CurrentListWidget.tsx?raw";
import listProgressWidgetSource from "../mobile/src/widgets/ListProgressWidget.tsx?raw";
import pinnedListWidgetSource from "../mobile/src/widgets/PinnedListWidget.tsx?raw";

describe("mobile React Compiler configuration (#171)", () => {
  it("enables experiments.reactCompiler in mobile/app.json and preserves config spread in app.config.js", () => {
    expect(
      (appJson as { expo?: { experiments?: { reactCompiler?: boolean } } }).expo?.experiments?.reactCompiler
    ).toBe(true);
    expect(appConfigSource).toContain("...config");
    expect(appConfigSource).not.toMatch(/experiments\s*:/);
  });

  it("configures React Compiler ESLint rules as errors in mobile/eslint.config.js", () => {
    expect(eslintConfigSource).toContain('"react-hooks/incompatible-library": "error"');
    expect(eslintConfigSource).toContain('"react-hooks/unsupported-syntax": "error"');
  });

  it("keeps core mobile screens and components opted in and widgets opted out via 'widget' directive", () => {
    const compiledTargets = [
      ["mobile/src/screens/TasksScreen.tsx", tasksScreenSource],
      ["mobile/src/screens/CalendarScreen.tsx", calendarScreenSource],
      ["mobile/src/screens/ListsScreen.tsx", listsScreenSource],
      ["mobile/src/components/TaskRow.tsx", taskRowSource],
      ["mobile/src/components/TaskModal.tsx", taskModalSource],
      ["mobile/src/components/TaskBreakdownModal.tsx", taskBreakdownModalSource],
      ["mobile/src/components/SubtaskEditModal.tsx", subtaskEditModalSource],
    ];

    for (const [file, source] of compiledTargets) {
      expect(source, `${file} should not opt out of React Compiler`).not.toMatch(
        /['"]use no (memo|forget)['"]/
      );
    }

    const widgets = [
      ["mobile/src/widgets/CurrentListWidget.tsx", currentListWidgetSource],
      ["mobile/src/widgets/ListProgressWidget.tsx", listProgressWidgetSource],
      ["mobile/src/widgets/PinnedListWidget.tsx", pinnedListWidgetSource],
    ];

    for (const [file, source] of widgets) {
      expect(source, `${file} must keep 'widget' directive`).toMatch(/['"]widget['"];/);
    }
  });
});

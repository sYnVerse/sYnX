import { test, expect } from "@playwright/test";
import { createTestUser, signInAs, suppressWhatsNew } from "./helpers";

test.describe("Web task Start timer and completion time stats (#103)", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("list Start timer persists across reload and records completion stats line on check-off", async ({ page }) => {
    const user = createTestUser("web_timer_list");
    await signInAs(page, user);

    const taskInput = page.getByPlaceholder("What needs to be done?");
    await taskInput.fill("Write release notes for 20m");
    await taskInput.press("Enter");
    await expect(taskInput).toHaveValue("");

    const taskRow = page.locator("li", { hasText: "Write release notes" });
    await expect(taskRow).toBeVisible();
    await expect(taskRow).toContainText("20m");

    await taskRow.hover();
    await taskRow.locator('[data-testid="task-timer-start"]').click();

    const runningBtn = taskRow.locator('[data-testid="task-timer-running"]');
    await expect(runningBtn).toBeVisible();
    await expect(runningBtn).toContainText(/⏱/);

    // Reload and verify the running timer survived SSR + client hydration
    await page.reload();
    const reloadedRow = page.locator("li", { hasText: "Write release notes" });
    await expect(reloadedRow).toBeVisible();
    await expect(reloadedRow.locator('[data-testid="task-timer-running"]')).toBeVisible();

    // Complete the timed task and inspect stats inside the Completed section
    await reloadedRow.locator('button[type="submit"]').first().click();
    await page.getByRole("button", { name: /^Completed tasks,/i }).click();

    const completedRow = page.locator("li", { hasText: "Write release notes" });
    await expect(completedRow).toBeVisible();
    await expect(completedRow.locator('[data-testid="task-completion-stats"]')).toContainText(
      /Took (?:<1|\d+) min • est 20/
    );
  });

  test("calendar chip timer toggles independently, EditTaskModal manages timer, and modal shows completion stats", async ({ page }) => {
    const user = createTestUser("web_timer_cal");
    await signInAs(page, user);

    await page.getByRole("button", { name: "📅 Calendar" }).click();
    const todayCell = page.locator("div.ring-1.ring-themeAccentRing\\/40");
    await todayCell.hover();
    await todayCell.getByTitle("Add task on this day").click();

    await expect(page.getByRole("heading", { name: "Quick Add Task" })).toBeVisible();
    await page.locator("#quick-add-task-text").fill("Prep demo for 15m");
    await page.getByRole("button", { name: "Add Task", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quick Add Task" })).not.toBeVisible();

    const calChip = todayCell.locator("div.group\\/task", { hasText: "Prep demo" });
    await expect(calChip).toBeVisible();

    // Clicking Start on the calendar chip starts the timer without opening EditTaskModal
    await calChip.hover();
    await calChip.locator('[data-testid="calendar-task-timer-start"]').click();
    await expect(calChip.locator('[data-testid="calendar-task-timer-running"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit Task" })).not.toBeVisible();

    // Open EditTaskModal -> verify running timer, stop it, restart it, and close
    await calChip.getByRole("button", { name: "Prep demo" }).click();
    await expect(page.getByRole("heading", { name: "Edit Task" })).toBeVisible();
    await expect(page.locator('[data-testid="edit-modal-timer-running"]')).toBeVisible();

    await page.locator('[data-testid="edit-modal-timer-running"]').click();
    await expect(page.locator('[data-testid="edit-modal-timer-start"]')).toBeVisible();

    await page.locator('[data-testid="edit-modal-timer-start"]').click();
    await expect(page.locator('[data-testid="edit-modal-timer-running"]')).toBeVisible();

    await page.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit Task" })).not.toBeVisible();

    // Complete from the calendar chip, then reopen EditTaskModal to verify completion stats
    await calChip.locator("button").first().click();
    await expect(calChip.locator('[data-testid="calendar-task-timer-running"]')).not.toBeVisible();

    await calChip.getByRole("button", { name: "Prep demo" }).click();
    await expect(page.getByRole("heading", { name: "Edit Task" })).toBeVisible();
    await expect(page.locator('[data-testid="edit-modal-completion-stats"]')).toContainText(
      /Took (?:<1|\d+) min • est 15/
    );
  });
});

import { test, expect } from "@playwright/test";
import { createTestUser, gotoGuestList, signInAs, suppressWhatsNew } from "./helpers";

test.describe("Web smart quick add (#101)", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("guest list add-task form shows live chips, dismisses latest on Escape, and saves parsed metadata", async ({ page }) => {
    await gotoGuestList(page);

    const taskInput = page.getByPlaceholder("What needs to be done?");
    await taskInput.fill("Pay rent tomorrow 3pm weekly for 20m !high");

    const chips = page.locator('[data-testid="quick-add-chip"]');
    await expect(chips).toHaveCount(4);

    // Esc dismisses the most recent detected chip (!high) while leaving the remaining 3 active
    await taskInput.press("Escape");
    await expect(chips).toHaveCount(3);

    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(taskInput).toHaveValue("");

    const taskItem = page.locator("li", { hasText: "Pay rent" });
    await expect(taskItem).toBeVisible();
    await expect(taskItem).toContainText("!high");
    await expect(taskItem).toContainText("20m");
    await expect(taskItem).toContainText(/weekly/i);
    await expect(taskItem).not.toContainText("for 20m");
    await expect(taskItem).not.toContainText("tomorrow 3pm");
  });

  test("signed-in form and calendar QuickAddTaskModal strip tokens, handle Escape step-by-step, and submit parsed metadata", async ({ page }) => {
    const user = createTestUser("quick_add");
    await signInAs(page, user);

    const taskInput = page.getByPlaceholder("What needs to be done?");
    await taskInput.fill("Submit report tomorrow 2pm weekly for 30m !high");

    const chips = page.locator('[data-testid="quick-add-chip"]');
    await expect(chips).toHaveCount(4);

    // Enter saves with stripped title and parsed metadata
    await taskInput.press("Enter");
    await expect(taskInput).toHaveValue("");

    const listTask = page.locator("li", { hasText: "Submit report" });
    await expect(listTask).toBeVisible();
    await expect(listTask).toContainText("30m");
    await expect(listTask).toContainText(/weekly/i);
    await expect(listTask).toContainText(/high/i);
    await expect(listTask).not.toContainText("!high");
    await expect(listTask).not.toContainText("for 30m");

    // Switch to Calendar view and test QuickAddTaskModal Escape order + submission
    await page.getByRole("button", { name: "📅 Calendar" }).click();
    const todayCell = page.locator("div.ring-1.ring-themeAccentRing\\/40");
    await todayCell.hover();
    await todayCell.getByTitle("Add task on this day").click();

    await expect(page.getByRole("heading", { name: "Quick Add Task" })).toBeVisible();
    const modalInput = page.locator("#quick-add-task-text");
    await modalInput.fill("2pm standup weekly for 15m !med");

    const modalChips = page.locator('[data-testid="quick-add-chip"]');
    await expect(modalChips).toHaveCount(4);

    // Each Escape removes one chip without closing the modal
    for (const remaining of [3, 2, 1, 0]) {
      await page.keyboard.press("Escape");
      await expect(modalChips).toHaveCount(remaining);
      await expect(page.getByRole("heading", { name: "Quick Add Task" })).toBeVisible();
    }

    // Pressing Escape with 0 chips closes the modal
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Quick Add Task" })).not.toBeVisible();

    // Reopen, fill without dismissing, and submit
    await todayCell.hover();
    await todayCell.getByTitle("Add task on this day").click();
    await expect(page.getByRole("heading", { name: "Quick Add Task" })).toBeVisible();
    await page.locator("#quick-add-task-text").fill("2pm standup weekly for 15m !high");
    await expect(page.locator('[data-testid="quick-add-chip"]')).toHaveCount(4);

    await page.getByRole("button", { name: "Add Task", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quick Add Task" })).not.toBeVisible();

    const calBtn = todayCell.getByRole("button", { name: "standup" });
    await expect(calBtn).toBeVisible();

    await page.getByRole("button", { name: "📝 List" }).click();
    const standupRow = page.locator("li", { hasText: "standup" });
    await expect(standupRow).toBeVisible();
    await expect(standupRow).toContainText("15m");
    await expect(standupRow).toContainText(/weekly/i);
    await expect(standupRow).toContainText(/high/i);
    await expect(standupRow).not.toContainText("!high");
    await expect(standupRow).not.toContainText("for 15m");
  });
});

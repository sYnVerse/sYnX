import { test, expect } from "@playwright/test";
import { WEB_VERSION } from "../app/constants/changelog";

test.describe("List page smoke tests", () => {
  test.beforeEach(async ({ page }) => {
    // Suppress the auto-opening What's New modal during smoke tests
    await page.addInitScript((version) => {
      window.localStorage.setItem("last_seen_changelog_version", version);
    }, WEB_VERSION);
  });

  test("creates a new list", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Open the create list dialog from the sidebar
    await page.getByRole("button", { name: "Create new list" }).click();
    await expect(page.getByRole("heading", { name: "Create New List" })).toBeVisible();

    // Fill in the list name and submit
    await page.locator("#create-list-name").fill("Groceries");
    await page.getByRole("button", { name: "Create List" }).click();

    // The dialog should close and the page should navigate to the new list
    await expect(page.getByRole("heading", { name: "Create New List" })).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Groceries");
    await expect(page.locator("aside").getByText("Groceries")).toBeVisible();
  });

  test("adds a task, marks it complete, and deletes it", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Add a new task
    const taskInput = page.getByPlaceholder("What needs to be done?");
    await taskInput.fill("Buy milk");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // Verify task appears in the list
    const taskItem = page.locator("li", { hasText: "Buy milk" });
    await expect(taskItem).toBeVisible();

    // Mark task complete
    const checkbox = taskItem.locator("button[data-checked]");
    await checkbox.click();

    // The completed task moves to the Completed section at the bottom
    const completedToggle = page.getByRole("button", { name: /Completed tasks, 1/ });
    await expect(completedToggle).toBeVisible();

    // Expand the completed section to see the task
    await completedToggle.click();
    await expect(taskItem).toBeVisible();
    await expect(taskItem.locator("button[data-checked='true']")).toBeVisible();

    // Delete the task
    await taskItem.hover();
    await taskItem.getByRole("button", { name: "Delete task" }).click();
    await expect(page.getByText("Buy milk")).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Completed tasks/ })).not.toBeVisible();
  });

  test("adds a subtask and checks that it moves to the Completed section once completed", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Add a parent task
    const taskInput = page.getByPlaceholder("What needs to be done?");
    await taskInput.fill("Parent task");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const parentTask = page.locator("li", { hasText: "Parent task" });
    await expect(parentTask).toBeVisible();

    // Open subtask input
    await parentTask.getByRole("button", { name: "Add Subtask" }).click();
    const subtaskInput = page.getByPlaceholder("New subtask name...");
    await expect(subtaskInput).toBeVisible();

    // Fill and submit the subtask
    await subtaskInput.fill("Subtask 1");
    await subtaskInput.press("Enter");

    // Verify subtask is visible under parent
    const subtaskItem = page.locator("li", { hasText: "Subtask 1" });
    await expect(subtaskItem).toBeVisible();

    // Mark subtask as complete
    const subtaskCheckbox = subtaskItem.locator("button[data-checked]");
    await subtaskCheckbox.click();

    // Completed subtask moves to the completed subtask section (collapsed by default)
    const subtaskCompletedToggle = page.getByRole("button", { name: /Completed subtasks, 1/ });
    await expect(subtaskCompletedToggle).toBeVisible();
    await expect(subtaskItem).not.toBeVisible();

    // Expand completed subtasks section and verify subtask is there and checked
    await subtaskCompletedToggle.click();
    await expect(subtaskItem).toBeVisible();
    await expect(subtaskItem.locator("button[data-checked='true']")).toBeVisible();
  });

  test("changes the sort and confirms the list remembers it after a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    const sortSelect = page.locator("div:has(> span:text-is('Sort by')) select");
    await expect(sortSelect).toHaveValue("reminder");

    // Change sort to Alphabetical
    await sortSelect.selectOption("alphabetical");
    await expect(sortSelect).toHaveValue("alphabetical");

    // Reload the page and verify sort selection persists
    await page.reload();
    await expect(sortSelect).toHaveValue("alphabetical");
  });

  test("switches to the calendar view and back", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Calendar elements should not be visible in list view
    await expect(page.getByRole("button", { name: "Today" })).not.toBeVisible();

    // Switch to calendar view
    await page.getByRole("button", { name: "📅 Calendar" }).click();
    await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
    await expect(page.getByText("Sun", { exact: true })).toBeVisible();

    // Switch back to list view
    await page.getByRole("button", { name: "📝 List" }).click();
    await expect(page.getByRole("button", { name: "Today" })).not.toBeVisible();
  });
});

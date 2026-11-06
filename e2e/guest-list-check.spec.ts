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

  test("opens task pickers on the bottom-most item without getting clipped inside the scrolling list (#140)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    const taskInput = page.getByPlaceholder("What needs to be done?");
    const addButton = page.getByRole("button", { name: "Add", exact: true });
    for (let i = 1; i <= 6; i++) {
      await taskInput.fill(`Task item ${i}`);
      await addButton.click();
      await expect(page.locator("li", { hasText: `Task item ${i}` })).toBeVisible();
      await expect(taskInput).toHaveValue("");
    }

    const lastTask = page.locator("li", { hasText: "Task item 6" });
    await lastTask.scrollIntoViewIfNeeded();

    // Open Priority picker on the last task
    const priorityButton = lastTask.getByRole("button", { name: "NONE" });
    await priorityButton.click();

    // The popover options should be fully visible and rendered above or inside viewport
    const highOption = page.getByRole("button", { name: /HIGH/i });
    await expect(highOption).toBeVisible();

    const box = await highOption.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

    // Click HIGH and verify update
    await highOption.click();
    await expect(lastTask.getByRole("button", { name: /HIGH/i })).toBeVisible();
  });

  test("opens duration selector completely on screen on narrow mobile viewport (#138)", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    const taskInput = page.getByPlaceholder("What needs to be done?");
    await taskInput.fill("Narrow screen task");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("li", { hasText: "Narrow screen task" })).toBeVisible();

    const taskItem = page.locator("li", { hasText: "Narrow screen task" });
    const durationButton = taskItem.getByRole("button", { name: "Set estimated duration" });
    await expect(durationButton).toBeVisible();
    await durationButton.click();

    // Find the 5m option button inside the open duration popover
    const fiveMinOption = page.getByRole("button", { name: "5m", exact: true });
    await expect(fiveMinOption).toBeVisible();

    const box = await fiveMinOption.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);

    // Click 5m and confirm duration is set
    await fiveMinOption.click();
    await expect(taskItem.getByText("5m")).toBeVisible();
  });

  test("creates a list with no category by default, allows adding a category tag, and clearing it back to none (#139)", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Open create list modal
    await page.getByRole("button", { name: "Create new list" }).click();
    await expect(page.getByRole("heading", { name: "Create New List" })).toBeVisible();

    // Verify "None" is selected by default
    const noneChip = page.getByRole("button", { name: "🚫 None" });
    await expect(noneChip).toBeVisible();

    // Fill in name and create
    await page.locator("#create-list-name").fill("No Tag List");
    await page.getByRole("button", { name: "Create List" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("No Tag List");

    // The uncategorized list header should show "+ Add Tag" button and no category tag
    const addTagButton = page.getByRole("button", { name: "+ Add Tag" });
    await expect(addTagButton).toBeVisible();

    // Click "+ Add Tag" to open category dialog
    await addTagButton.click();
    await expect(page.getByRole("heading", { name: "Edit Category Tag" })).toBeVisible();

    // Select "Shopping" tag and save
    const shoppingChip = page.getByRole("button", { name: "🛒 Shopping" });
    await shoppingChip.click();
    await page.getByRole("button", { name: "Save Category" }).click();

    // Header now shows the category tag
    const categoryTag = page.getByRole("button", { name: "🛒 Shopping" });
    await expect(categoryTag).toBeVisible();
    await expect(addTagButton).not.toBeVisible();

    // Click category tag to open Edit Category Tag dialog again
    await categoryTag.click();
    await expect(page.getByRole("heading", { name: "Edit Category Tag" })).toBeVisible();

    // Clear category tag by clicking "None"
    const editNoneChip = page.getByRole("button", { name: "🚫 None" });
    await editNoneChip.click();
    await page.getByRole("button", { name: "Save Category" }).click();

    // Verify tag is cleared and "+ Add Tag" is back
    await expect(categoryTag).not.toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add Tag" })).toBeVisible();
  });
});

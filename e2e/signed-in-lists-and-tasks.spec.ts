import { test, expect } from "@playwright/test";
import { addTask, createTestUser, signInAs, suppressWhatsNew } from "./helpers";

test.describe("Signed-in Lists & Tasks Suite", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("list CRUD, preset category tags, and custom category tags", async ({ page }) => {
    const user = createTestUser("lists");
    await signInAs(page, user);

    // Create a new list with preset category "Work"
    await page.getByRole("button", { name: "Create new list" }).click();
    await expect(page.getByRole("heading", { name: "Create New List" })).toBeVisible();

    await page.locator("#create-list-name").fill("Work Deliverables");
    await page.getByRole("button", { name: /Work/i }).click();
    await page.getByRole("button", { name: "Create List" }).click();

    // Verify list heading and category tag badge in header
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Work Deliverables");
    await expect(page.getByTitle("Edit Category Tag")).toContainText("Work");

    // Click category badge to edit category to Custom
    await page.getByTitle("Edit Category Tag").click();
    await expect(page.getByRole("heading", { name: "Edit Category Tag" })).toBeVisible();

    await page.getByRole("button", { name: /Custom/i }).click();
    await page.locator("#edit-list-custom-category").fill("Sprint 42");
    await page.getByRole("button", { name: "Save Category" }).click();

    // Confirm updated custom category tag
    await expect(page.getByTitle("Edit Category Tag")).toContainText("Sprint 42");

    // Header inline rename
    await page.getByTitle("Click to rename").click();
    const titleInput = page.locator("input.font-display");
    await titleInput.fill("Sprint Deliverables");
    await titleInput.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sprint Deliverables");

    // Sidebar rename
    const listRow = page.locator("aside nav").locator("div.group", { hasText: "Sprint Deliverables" });
    await listRow.hover();
    await listRow.getByTitle("Rename list").click();
    await expect(page.getByRole("heading", { name: "Rename List" })).toBeVisible();
    await page.locator("div.fixed.inset-0 input[placeholder='Enter new list name...']").fill("Final Deliverables");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Final Deliverables");

    // Sidebar delete
    const renamedRow = page.locator("aside nav").locator("div.group", { hasText: "Final Deliverables" });
    await renamedRow.hover();
    await renamedRow.getByTitle("Delete list").click();
    await expect(page.getByRole("heading", { name: "Delete this list?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete List", exact: true }).click();

    // Confirm deleted and redirected to primary list
    await expect(page.locator("aside nav").getByText("Final Deliverables")).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Final Deliverables");
  });

  test("task & subtask lifecycle: creation, inline edit, subtasks, completed toggles, and clear completed", async ({
    page,
  }) => {
    const user = createTestUser("tasks");
    await signInAs(page, user);

    // 1. Create parent task
    await addTask(page, "Architecture Refactor");
    const parentTask = page.getByRole("listitem").first();
    await expect(parentTask).toBeVisible();
    await expect(parentTask).toContainText("Architecture Refactor");

    // 2. Edit task text inline via double-click
    await parentTask.getByText("Architecture Refactor").dblclick();
    const editInput = parentTask.locator("input[type='text']");
    await expect(editInput).toBeVisible();
    await editInput.fill("Architecture Overhaul");
    await parentTask.getByRole("button", { name: "Save" }).click();
    await expect(parentTask).toContainText("Architecture Overhaul");

    // 3. Add subtask
    await parentTask.getByTitle("Add Subtask").click();
    const subtaskInput = page.getByPlaceholder("New subtask name...");
    await subtaskInput.fill("Design Data Flow");
    await subtaskInput.press("Enter");

    const subtaskItem = page.locator("li", { hasText: "Design Data Flow" });
    await expect(subtaskItem).toBeVisible();

    // 4. Complete subtask -> moves to completed subtasks collapsible section
    await subtaskItem.locator("button[data-checked]").click();
    const completedSubtaskToggle = page.getByRole("button", { name: /Completed subtasks/i });
    await expect(completedSubtaskToggle).toBeVisible();

    // Expand completed subtasks toggle and uncomplete
    await completedSubtaskToggle.click();
    await expect(subtaskItem).toBeVisible();
    await subtaskItem.locator("button[data-checked]").click();
    await expect(subtaskItem).toBeVisible();

    // 5. Delete subtask
    await subtaskItem.hover();
    await subtaskItem.getByTitle("Delete task").click();
    await expect(subtaskItem).not.toBeVisible();

    // 6. Complete parent task -> moves to completed tasks collapsible section
    await parentTask.locator("button[data-checked]").first().click();
    const completedTasksToggle = page.getByRole("button", { name: /Completed tasks/i });
    await expect(completedTasksToggle).toBeVisible();

    // 7. Clear completed tasks
    await page.getByRole("button", { name: "Clear completed" }).click();
    await expect(page.locator("li", { hasText: "Architecture Overhaul" })).not.toBeVisible();
    await expect(completedTasksToggle).not.toBeVisible();
  });

  test("task pickers: priority, duration, recurrence, and reminder persistence", async ({ page }) => {
    const user = createTestUser("pickers");
    await signInAs(page, user);

    await addTask(page, "Task With All Pickers");
    const taskItem = page.locator("li", { hasText: "Task With All Pickers" });
    await expect(taskItem).toBeVisible();

    // 1. Priority picker -> High
    const priorityBtn = taskItem.locator("button", { hasText: /No Priority|Priority|None/i });
    await priorityBtn.click();
    await page.getByRole("button", { name: /High/i }).click();
    await expect(taskItem.locator("button", { hasText: /High/i })).toBeVisible();

    // 2. Duration picker -> 45m
    const durationBtn = taskItem.getByTitle("Set Duration");
    await durationBtn.click();
    await page.getByRole("button", { name: "45m" }).click();
    await expect(taskItem.getByTitle("Set Duration")).toContainText("45m");

    // 3. Recurrence picker -> Daily
    const recurrenceBtn = taskItem.getByTitle("Repeat Settings");
    await recurrenceBtn.click();
    await page.getByRole("button", { name: /Daily/i }).click();
    await expect(taskItem).toContainText("daily");

    // 4. Reminder picker -> In 15 mins
    const reminderBtn = taskItem.getByTitle("Set reminder");
    await reminderBtn.click();
    const reminderPromise = page.waitForResponse(
      (resp) => resp.request().method() === "POST" && resp.status() === 200
    );
    await page.getByRole("button", { name: /In 15 mins/i }).click();
    await reminderPromise;
    await expect(taskItem.getByTitle(/Reminder:/)).toBeVisible();

    // Reload page to confirm all properties persisted in D1
    await page.reload();

    const reloadedItem = page.locator("li", { hasText: "Task With All Pickers" });
    await expect(reloadedItem).toBeVisible();
    await expect(reloadedItem.locator("button", { hasText: /High/i })).toBeVisible();
    await expect(reloadedItem.getByTitle("Set Duration")).toContainText("45m");
    await expect(reloadedItem).toContainText("daily");
    await expect(reloadedItem.getByTitle(/Reminder:/)).toBeVisible();
  });

  test("toolbar sort and filter persistence across reloads", async ({ page }) => {
    const user = createTestUser("sortfilter");
    await signInAs(page, user);

    // Change Sort to Priority
    const sortSelect = page.locator("div:has(> span:text('Sort by')) select");
    await sortSelect.selectOption("priority");

    // Change Filter to Active
    await page.getByRole("button", { name: /^Active/ }).click();
    await expect(page.getByRole("button", { name: /^Active/ })).toHaveClass(/bg-themeAccentBg/);

    // Reload page
    await page.reload();

    // Verify sort is remembered from storage
    await expect(sortSelect).toHaveValue("priority");
  });

  test("calendar view: unscheduled list, quick add date cell, edit task and clear date", async ({ page }) => {
    const user = createTestUser("calendar");
    await signInAs(page, user);

    // Create an unscheduled task in List view
    await addTask(page, "Unscheduled Background Task");

    // Switch to Calendar View
    await page.getByRole("button", { name: "📅 Calendar" }).click();
    await expect(page.getByRole("heading", { name: /Unscheduled Tasks/ })).toBeVisible();
    await expect(page.getByText("Unscheduled Background Task")).toBeVisible();

    // Quick add task on today's date cell
    const todayCell = page.locator("div.ring-1.ring-themeAccentRing\\/40");
    await todayCell.hover();
    const plusBtn = todayCell.getByTitle("Add task on this day");
    await plusBtn.click();

    await expect(page.getByRole("heading", { name: "Quick Add Task" })).toBeVisible();
    await page.locator("#quick-add-task-text").fill("Scheduled Calendar Event");
    await page.getByRole("button", { name: "Add Task", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quick Add Task" })).not.toBeVisible();

    // Verify the scheduled event appears on the cell
    const eventBtn = todayCell.getByRole("button", { name: "Scheduled Calendar Event" });
    await expect(eventBtn).toBeVisible();

    // Click event to open EditTaskModal
    await eventBtn.dispatchEvent("click");
    await expect(page.getByRole("heading", { name: "Edit Task Details" })).toBeVisible();

    // Click Clear Date to unschedule it
    await page.getByRole("button", { name: "Clear Date" }).click();
    await page.getByRole("button", { name: "Save Changes" }).click();

    // Confirm it moved to the Unscheduled Tasks panel
    await expect(page.getByRole("heading", { name: /Unscheduled Tasks/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Scheduled Calendar Event" })).toBeVisible();

    // Switch back to List view
    await page.getByRole("button", { name: "📝 List" }).click();
    await expect(page.locator("li", { hasText: "Scheduled Calendar Event" })).toBeVisible();
  });
});

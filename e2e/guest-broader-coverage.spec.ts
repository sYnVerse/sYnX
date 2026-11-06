import { test, expect } from "@playwright/test";
import { addTask, suppressWhatsNew } from "./helpers";

test.describe("Guest Broader Coverage", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("empty state is displayed on a fresh guest list", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    await expect(page.getByText("No tasks in this list")).toBeVisible();
    await expect(page.getByText("Add your first task above to get started.")).toBeVisible();
  });

  test("filter buttons (All, Active, Done) and filter-specific empty states", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Add first task and keep it active
    await addTask(page, "Active Test Task");

    // Add second task and mark it completed
    await addTask(page, "Completed Test Task");
    const completedItem = page.locator("li", { hasText: "Completed Test Task" });
    await expect(completedItem).toBeVisible();

    // Check the checkbox to complete it
    await completedItem.locator("button[data-checked]").click();

    // Test Active filter
    await page.getByRole("button", { name: /^Active/ }).click();
    await expect(page.locator("li", { hasText: "Active Test Task" })).toBeVisible();
    await expect(page.locator("li", { hasText: "Completed Test Task" })).not.toBeVisible();

    // Test Done filter
    await page.getByRole("button", { name: /^Done/ }).click();
    await expect(page.locator("li", { hasText: "Completed Test Task" })).toBeVisible();
    await expect(page.locator("li", { hasText: "Active Test Task" })).not.toBeVisible();

    // Clear the completed task to check the empty Done state
    await page.getByRole("button", { name: "Clear completed" }).click();
    await expect(page.getByText("No completed tasks in this list.")).toBeVisible();

    // Switch to Active filter
    await page.getByRole("button", { name: /^Active/ }).click();
    await expect(page.locator("li", { hasText: "Active Test Task" })).toBeVisible();

    // Complete the active task while on Active filter
    await page.locator("li", { hasText: "Active Test Task" }).locator("button[data-checked]").click();
    await expect(page.getByText("No active tasks in this list.")).toBeVisible();
  });

  test("task search filters tasks and clear button restores list", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    await addTask(page, "Buy fresh groceries");
    await addTask(page, "Schedule dentist appointment");

    const searchInput = page.getByPlaceholder("Search tasks...");
    await searchInput.fill("groceries");

    await expect(page.locator("li", { hasText: "Buy fresh groceries" })).toBeVisible();
    await expect(page.locator("li", { hasText: "Schedule dentist appointment" })).not.toBeVisible();

    // Clear search by clicking the ✕ clear button
    const clearSearchBtn = page.getByRole("button", { name: "✕" });
    await clearSearchBtn.click();

    await expect(searchInput).toHaveValue("");
    await expect(page.locator("li", { hasText: "Buy fresh groceries" })).toBeVisible();
    await expect(page.locator("li", { hasText: "Schedule dentist appointment" })).toBeVisible();
  });

  test("guest list header rename, sidebar rename, and list deletion", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Create a second guest list so deletion is allowed
    await page.getByRole("button", { name: "Create new list" }).click();
    await expect(page.getByRole("heading", { name: "Create New List" })).toBeVisible();
    await page.locator("#create-list-name").fill("Secondary List");
    await page.getByRole("button", { name: "Create List" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Secondary List");

    // Header inline rename
    await page.getByTitle("Click to rename").click();
    const titleEditInput = page.locator("input.font-display");
    await titleEditInput.fill("Renamed In Header");
    await titleEditInput.press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Renamed In Header");

    // Delete the list from the sidebar
    const listRow = page.locator("aside nav").locator("div.group", { hasText: "Renamed In Header" });
    await listRow.hover();
    await listRow.getByTitle("Delete list").click();

    await expect(page.getByRole("heading", { name: "Delete this list?" })).toBeVisible();
    await page.getByRole("button", { name: "Delete List", exact: true }).click();

    // Confirm the list was deleted and redirected to primary list
    await expect(page.locator("aside nav").getByText("Renamed In Header")).not.toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Renamed In Header");
  });

  test("guest statistics modal, theme switcher, and sign in CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Open guest statistics & themes modal
    await page.getByTitle("Guest Statistics & Themes").click();
    await expect(page.getByText("Usage Metrics")).toBeVisible();
    await expect(page.getByText("Lists", { exact: true })).toBeVisible();
    await expect(page.getByText("Tasks", { exact: true })).toBeVisible();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();

    // Test Theme switching
    await page.getByRole("button", { name: /Emerald Forest/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "emerald");

    await page.getByRole("button", { name: /Midnight Indigo/i }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");

    // Verify the Sign In prompt is shown inside the guest profile modal
    const signInLinks = page.locator("a[href='/login']");
    await expect(signInLinks.first()).toBeVisible();

    // Close the profile modal
    await page.locator("div.fixed.inset-0 button").filter({ has: page.locator("svg path[d*='M6 18']") }).first().click();
    await expect(page.getByText("Usage Metrics")).not.toBeVisible();
  });
});

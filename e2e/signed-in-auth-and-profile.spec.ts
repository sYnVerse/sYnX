import { test, expect } from "@playwright/test";
import { addTask, createTestUser, signInAs, suppressWhatsNew } from "./helpers";

test.describe("Signed-in Auth & Profile Suite", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("sign-in, session persistence on reload, and sign-out", async ({ page }) => {
    const user = createTestUser("session");
    await signInAs(page, user);

    // Sidebar should reflect the signed-in user's display name
    await expect(page.locator("aside").getByText(user.displayName!)).toBeVisible();

    // Reload and assert session persists
    await page.reload();
    await expect(page.locator("aside").getByText(user.displayName!)).toBeVisible();

    // Sign out via the sidebar sign-out button
    await page.locator("aside form[action='/logout'] button").click();

    // After sign-out, sidebar should show Unsaved Guest state
    await expect(page.locator("aside").getByText("Unsaved Guest")).toBeVisible();
    await expect(page.locator("aside").getByRole("link", { name: "Sign In to Save Lists" })).toBeVisible();

    // Reload and assert user remains signed out as guest
    await page.reload();
    await expect(page.locator("aside").getByText("Unsaved Guest")).toBeVisible();
    await expect(page.locator("aside").getByRole("link", { name: "Sign In to Save Lists" })).toBeVisible();

    // Protected settings are inaccessible: "Profile, Statistics & Themes" is absent
    await expect(page.getByRole("button", { name: "Profile, Statistics & Themes" })).not.toBeVisible();

    // Guest modal shows only statistics and themes, omitting protected notification controls
    await page.getByRole("button", { name: "Guest Statistics & Themes" }).click();
    await expect(page.getByText("Sign in to configure Email, SMS, and Discord task notifications.")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Select home timezone" })).not.toBeVisible();
    await page.keyboard.press("Escape");

    // Direct API request to protected settings endpoint returns 401 Unauthorized
    const apiRes = await page.request.get("/api/v1/settings");
    expect(apiRes.status()).toBe(401);
  });

  test("migrates guest lists and tasks to the signed-in account and clears localStorage", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/[a-zA-Z0-9_-]+/);

    // Create a task on default list
    await addTask(page, "Guest Task To Migrate");

    // Create a second guest list
    await page.getByRole("button", { name: "Create new list" }).click();
    await expect(page.getByRole("heading", { name: "Create New List" })).toBeVisible();
    await page.locator("#create-list-name").fill("Migrated Project");
    await page.getByRole("button", { name: "Create List" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Migrated Project");

    // Add a task in second list
    await addTask(page, "Project Action Item");

    // Sign in now
    const user = createTestUser("migrator");
    await signInAs(page, user);

    // The user should now see their migrated lists in the sidebar
    await expect(page.locator("aside nav").getByText("Migrated Project")).toBeVisible();
    await expect(page.locator("aside nav").getByText("My Tasks").first()).toBeVisible();

    // Verify localStorage guest key has been cleared
    const guestStorage = await page.evaluate(() => window.localStorage.getItem("synx_guest_lists"));
    expect(guestStorage).toBeNull();
  });

  test("updates profile display name, home time zone, and notification channels with persistence", async ({ page }) => {
    const user = createTestUser("profiler");
    await signInAs(page, user);

    // Open Profile Modal
    await page.getByTitle("Profile, Statistics & Themes").click();
    await expect(page.getByText("Usage Metrics")).toBeVisible();

    // Change display name
    const newName = `Renamed ${user.displayName}`;
    const nameInput = page.locator("input[placeholder='sYnX user']");
    await nameInput.fill(newName);

    // Change home time zone
    const tzInput = page.getByLabel("Home time zone");
    await tzInput.fill("America/Chicago");

    // Toggle Email Notifications
    const emailToggle = page.locator("div.flex.items-center.justify-between:has-text('Email Notifications') button");
    await emailToggle.click();

    // Toggle SMS Notifications and enter phone
    const smsToggle = page.locator("div.flex.items-center.justify-between:has-text('SMS Notifications') button");
    await smsToggle.click();
    const phoneInput = page.locator("input[placeholder='10-digit number']");
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill("5551234567");

    // Toggle Discord and enter webhook
    const discordToggle = page.locator("div.flex.items-center.justify-between:has-text('Discord Webhook') button");
    await discordToggle.click();
    const discordInput = page.locator("input[placeholder*='discord.com/api/webhooks']");
    await expect(discordInput).toBeVisible();
    await discordInput.fill("https://discord.com/api/webhooks/123/abc");

    // Save preferences
    await page.getByRole("button", { name: "Save Preferences" }).click();

    // Close modal
    await page.locator("div.fixed.inset-0 button").filter({ has: page.locator("svg path[d*='M6 18']") }).first().click();

    // Reload page to verify persistence across sessions
    await page.reload();

    // Verify updated display name in sidebar
    await expect(page.locator("aside").getByText(newName)).toBeVisible();

    // Reopen Profile Modal and verify persisted fields
    await page.getByTitle("Profile, Statistics & Themes").click();
    await expect(page.locator("input[placeholder='sYnX user']")).toHaveValue(newName);
    await expect(page.getByLabel("Home time zone")).toHaveValue("America/Chicago");
    await expect(phoneInput).toHaveValue("5551234567");
    await expect(discordInput).toHaveValue("https://discord.com/api/webhooks/123/abc");
  });

  test("unsaved notification settings prompt warns on close and allows cancel or discard", async ({ page }) => {
    const user = createTestUser("unsaved");
    await signInAs(page, user);

    await page.getByTitle("Profile, Statistics & Themes").click();
    await expect(page.getByText("Usage Metrics")).toBeVisible();

    // Toggle email notification without saving
    const emailToggle = page.locator("div.flex.items-center.justify-between:has-text('Email Notifications') button");
    await emailToggle.click();

    // Try to close modal
    const closeBtn = page.locator("div.fixed.inset-0 button").filter({ has: page.locator("svg path[d*='M6 18']") }).first();
    await closeBtn.click();

    // Unsaved prompt modal should appear
    await expect(page.getByRole("heading", { name: "Unsaved Notification Settings" })).toBeVisible();

    // Click Cancel -> Prompt closes, profile modal remains open
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Unsaved Notification Settings" })).not.toBeVisible();
    await expect(page.getByText("Usage Metrics")).toBeVisible();

    // Try to close again and click Discard
    await closeBtn.click();
    await expect(page.getByRole("heading", { name: "Unsaved Notification Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Discard" }).click();

    // Both prompt and profile modal should be closed
    await expect(page.getByRole("heading", { name: "Unsaved Notification Settings" })).not.toBeVisible();
    await expect(page.locator("div.fixed.inset-0").filter({ hasText: "Usage Metrics" })).not.toBeVisible();
  });

  test("accepts suggested display name from bottom banner", async ({ page }) => {
    const user = createTestUser("suggested");
    const suggestedName = "Sir Lancelot";
    await signInAs(page, { ...user, displayName: undefined }, { suggestedName });

    // Look for suggestion banner at bottom of page
    const suggestionBanner = page.locator("div", { hasText: `Use “${suggestedName}” as your display name?` });
    await expect(suggestionBanner.first()).toBeVisible();

    // Click "Use this name" button on banner
    await suggestionBanner.getByRole("button", { name: "Use this name" }).click();

    // Assert that the display name is updated in the sidebar
    await expect(page.locator("aside").getByText(suggestedName)).toBeVisible();
  });
});

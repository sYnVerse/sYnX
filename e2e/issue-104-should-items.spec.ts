import { test, expect } from "@playwright/test";
import { createTestUser, signInAs, suppressWhatsNew } from "./helpers";

test.describe("Issue #104 Should items (Web)", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("toggles Smart Quick Add off in Profile Settings to save literal text and back on for live chips", async ({ page }) => {
    const user = createTestUser("quick_add_toggle");
    await signInAs(page, user);

    // Disable Smart Quick Add in Profile Settings
    await page.getByTitle("Profile, Statistics & Themes").click();
    const toggle = page.locator('[data-testid="smart-quick-add-toggle"]');
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    // Close modal (no unsaved notification prompt triggered by Smart Quick Add toggle)
    await page
      .locator("div.fixed.inset-0 button")
      .filter({ has: page.locator("svg path[d*='M6 18']") })
      .first()
      .click();
    await expect(toggle).not.toBeVisible();

    const taskInput = page.getByPlaceholder("What needs to be done?");
    const rawPhrase = "Call mom tomorrow 3pm !high for 20m";
    await taskInput.fill(rawPhrase);
    await expect(page.locator('[data-testid="quick-add-chip"]')).toHaveCount(0);
    await taskInput.press("Enter");
    await expect(taskInput).toHaveValue("");

    const savedRow = page.locator("li", { hasText: rawPhrase });
    await expect(savedRow).toBeVisible();
    await expect(savedRow.locator("span", { hasText: rawPhrase }).first()).toHaveText(rawPhrase);
    await expect(savedRow).toContainText("None");
    await expect(savedRow.locator('button[title^="Reminder: "]')).toHaveCount(0);

    // Reload preserves disabled preference, then turning back ON resumes chip detection
    await page.reload();
    await page.getByTitle("Profile, Statistics & Themes").click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page
      .locator("div.fixed.inset-0 button")
      .filter({ has: page.locator("svg path[d*='M6 18']") })
      .first()
      .click();

    await taskInput.fill("Pay rent tomorrow 3pm !high");
    await expect(page.locator('[data-testid="quick-add-chip"]')).toHaveCount(2);
  });

  test("supports untimed duration quick pick, Skip, repeating Undo, and user-scoped CSV export", async ({ page, context }) => {
    const user = createTestUser("quick_pick_undo_csv");
    await signInAs(page, user);

    const taskInput = page.getByPlaceholder("What needs to be done?");

    // 1. Untimed task -> check off -> "How long did it take?" -> pick 30m
    await taskInput.fill("Untimed chore");
    await taskInput.press("Enter");
    await expect(taskInput).toHaveValue("");
    const untimedRow = page.locator("li", { hasText: "Untimed chore" });
    await untimedRow.locator('button[type="submit"]').first().click();

    await expect(page.getByRole("status")).toContainText("How long did it take?");
    await expect(page.locator('[data-testid="toast-duration-15"]')).toBeVisible();
    await expect(page.locator('[data-testid="toast-duration-30"]')).toBeVisible();
    await expect(page.locator('[data-testid="toast-duration-60"]')).toBeVisible();
    await expect(page.locator('[data-testid="toast-duration-skip"]')).toBeVisible();

    await page.locator('[data-testid="toast-duration-30"]').click();
    await expect(page.getByRole("status")).toContainText("Logged 30m");

    await page.getByRole("button", { name: /^Completed tasks,/i }).click();
    await expect(
      page.locator("li", { hasText: "Untimed chore" }).locator('[data-testid="task-completion-stats"]')
    ).toContainText("Took 30 min");

    // 2. Skip dismisses toast without recording duration
    await taskInput.fill("Skip chore");
    await taskInput.press("Enter");
    await expect(taskInput).toHaveValue("");
    await page.locator("li", { hasText: "Skip chore" }).locator('button[type="submit"]').first().click();
    await expect(page.locator('[data-testid="toast-duration-skip"]')).toBeVisible();
    await page.locator('[data-testid="toast-duration-skip"]').click();
    await expect(page.locator('[data-testid="toast-duration-skip"]')).not.toBeVisible();

    // 3. Repeating task -> complete -> Undo restores original reminder date/time
    await taskInput.fill("Water plants tomorrow 9am daily");
    await expect(page.locator('[data-testid="quick-add-chip"]')).toHaveCount(2);
    await taskInput.press("Enter");
    await expect(taskInput).toHaveValue("");

    const repeatRow = page.locator("li", { hasText: "Water plants" });
    await expect(repeatRow).toBeVisible();
    const reminderBtn = repeatRow.locator('button[title^="Reminder: "]');
    await expect(reminderBtn).toBeVisible();
    const initialReminderTitle = await reminderBtn.getAttribute("title");
    expect(initialReminderTitle).toBeTruthy();

    await repeatRow.locator('button[type="submit"]').first().click();
    await expect(page.locator('[data-testid="toast-undo-repeat"]')).toBeVisible();
    await expect(reminderBtn).not.toHaveAttribute("title", initialReminderTitle!);

    await page.locator('[data-testid="toast-undo-repeat"]').click();
    await expect(page.getByRole("status")).toContainText("Undid completion");
    await expect(reminderBtn).toHaveAttribute("title", initialReminderTitle!);

    // 4. Export Completions (CSV) from ProfileModal
    await page.getByTitle("Profile, Statistics & Themes").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator('[data-testid="export-completions-csv"]').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain(".csv");

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const csvContent = Buffer.concat(chunks).toString("utf8");
    expect(csvContent).toContain("id,todo_id,list_id,list_name,task_text,");
    expect(csvContent).toContain("Untimed chore");
    expect(csvContent).toContain(",1800,");
    expect(csvContent).toContain("Skip chore");
    expect(csvContent).not.toContain("Water plants"); // voided by repeat Undo

    // 5. Another signed-in user does not see user 1's entries in their CSV export
    const otherPage = await context.newPage();
    await suppressWhatsNew(otherPage);
    await signInAs(otherPage, createTestUser("other_csv_user"));
    const otherExport = await otherPage.request.get("/api/v1/completions/export");
    expect(otherExport.status()).toBe(200);
    const otherCsv = await otherExport.text();
    expect(otherCsv).not.toContain("Untimed chore");
    await otherPage.close();
  });
});

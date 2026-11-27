import { expect, test } from "@playwright/test";
import { addTask, createTestUser, signInAs, suppressWhatsNew, waitForHydration } from "./helpers";

test.describe("Issue #230 Archive lists (Web)", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("prompts on completing the last task, remembers Not now until reopened, archives/unarchives from banner and sidebar, and respects Settings toggle", async ({
    page,
  }) => {
    const user = createTestUser("archive_flow");
    await signInAs(page, user);

    // 1. Create a second list so we have an active list to fall back to when archiving
    await page.getByRole("button", { name: "Create new list" }).click();
    await expect(page.getByRole("heading", { name: "Create New List" })).toBeVisible();
    await page.locator("#create-list-name").fill("Trip Prep");
    await page.getByRole("button", { name: "Create List" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Trip Prep");

    const tripPrepUrl = new URL(page.url());
    const tripPrepId = tripPrepUrl.pathname.replace(/^\//, "");
    expect(tripPrepId).toBeTruthy();

    // 2. Add one task and check it off -> archive prompt appears
    await addTask(page, "Pack passport");
    await page.locator("li", { hasText: "Pack passport" }).locator("button[data-checked]").click();

    const prompt = page.getByTestId("archive-suggestion-prompt");
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText("All tasks done! Archive this list?");

    // 3. Click "Not now", reload -> remains suppressed for this completion cycle
    await page.getByTestId("archive-prompt-not-now").click();
    await expect(prompt).not.toBeVisible();
    await page.reload();
    await waitForHydration(page);
    await expect(prompt).not.toBeVisible();

    // 4. Reopen task and re-complete it -> archive prompt reappears
    await page.getByRole("button", { name: /Completed tasks, 1/ }).click();
    const completedItem = page.locator("li", { hasText: "Pack passport" });
    await expect(completedItem.locator("button[data-checked='true']")).toBeVisible();
    await completedItem.locator("button[data-checked='true']").click();
    await expect(page.getByText("1 task remaining")).toBeVisible();
    await expect(page.locator("li", { hasText: "Pack passport" }).locator("button[data-checked='false']")).toBeVisible();
    await page.locator("li", { hasText: "Pack passport" }).locator("button[data-checked='false']").click();
    await expect(prompt).toBeVisible();

    // 5. Archive via prompt -> redirects to active list, moves Trip Prep to Archived sidebar section
    await page.getByTestId("archive-prompt-archive").click();
    await page.waitForURL((url) => url.pathname !== `/${tripPrepId}`, { timeout: 10000 });
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Trip Prep");

    const archivedToggle = page.getByTestId("archived-section-toggle");
    await expect(archivedToggle).toBeVisible();
    await expect(archivedToggle).toContainText("Archived (1)");

    // 6. Open archived list from sidebar -> archived banner appears, adding a task auto-unarchives it
    await archivedToggle.click();
    const archivedSection = page.getByTestId("archived-lists-section");
    await expect(archivedSection.getByText("Trip Prep")).toBeVisible();
    await archivedSection.getByText("Trip Prep").click();
    await page.waitForURL((url) => url.pathname === `/${tripPrepId}`, { timeout: 10000 });

    const archivedBanner = page.getByTestId("archived-list-banner");
    await expect(archivedBanner).toBeVisible();

    await addTask(page, "Buy snacks");
    await expect(archivedBanner).not.toBeVisible();
    await expect(archivedToggle).not.toBeVisible();

    // 7. Archive and unarchive directly from Sidebar row buttons
    const sidebarLink = page.locator("aside nav a", { hasText: "Trip Prep" }).first();
    await sidebarLink.hover();
    await page.getByTestId(`archive-list-${tripPrepId}`).click();
    await page.waitForURL((url) => url.pathname !== `/${tripPrepId}`, { timeout: 10000 });
    await expect(archivedToggle).toBeVisible();

    await archivedToggle.click();
    await expect(archivedSection).toBeVisible();
    await archivedSection.getByText("Trip Prep").hover();
    await page.getByTestId(`unarchive-list-${tripPrepId}`).click();
    await expect(archivedToggle).not.toBeVisible();

    // 8. Disable Archive Suggestions in Profile Settings -> persists across reload & suppresses prompt
    await page.getByTitle("Profile, Statistics & Themes").click();
    const suggestionsToggle = page.getByTestId("archive-suggestions-toggle");
    await expect(suggestionsToggle).toHaveAttribute("aria-checked", "true");
    await suggestionsToggle.click();
    await expect(suggestionsToggle).toHaveAttribute("aria-checked", "false");

    await page
      .locator("div.fixed.inset-0 button")
      .filter({ has: page.locator("svg path[d*='M6 18']") })
      .first()
      .click();
    await expect(suggestionsToggle).not.toBeVisible();

    await page.reload();
    await waitForHydration(page);
    await page.getByTitle("Profile, Statistics & Themes").click();
    await expect(page.getByTestId("archive-suggestions-toggle")).toHaveAttribute("aria-checked", "false");
    await page
      .locator("div.fixed.inset-0 button")
      .filter({ has: page.locator("svg path[d*='M6 18']") })
      .first()
      .click();

    await page.locator("aside nav a", { hasText: "Trip Prep" }).first().click();
    await page.waitForURL((url) => url.pathname === `/${tripPrepId}`, { timeout: 10000 });
    await page.locator("li", { hasText: "Buy snacks" }).locator("button[data-checked='false']").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Trip Prep");
    await expect(page.getByText("All tasks completed!")).toBeVisible();
    await expect(prompt).not.toBeVisible();
  });
});

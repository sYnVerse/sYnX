import { expect, test } from "@playwright/test";
import { addTask, createTestUser, signInAs, suppressWhatsNew, waitForHydration } from "./helpers";

test.describe("Issue #212 Custom Manual sort order & tied-group reordering (Web)", () => {
  test.beforeEach(async ({ page }) => {
    await suppressWhatsNew(page);
  });

  test("switches to Manual, reorders tasks and subtasks across reloads, and limits non-Manual moves to tied siblings", async ({
    page,
  }) => {
    const user = createTestUser("sort_order");
    await signInAs(page, user);

    // 1. Add 3 tasks (newly created tasks prepend -> Gamma, Beta, Alpha)
    await addTask(page, "Task Alpha");
    await addTask(page, "Task Beta");
    await addTask(page, "Task Gamma");

    const topLevelWrapper = page.locator("ul > div");
    const topLevelTitles = page.locator("ul > div > li span[title]");
    await expect(topLevelTitles).toHaveText(["Task Gamma", "Task Beta", "Task Alpha"]);

    // Switch to Manual via the toolbar hint link
    const switchHint = page.getByTestId("switch-to-manual-sort");
    await expect(switchHint).toBeVisible();
    await switchHint.click();
    await expect(page.getByLabel("Sort by")).toHaveValue("manual");
    await expect(switchHint).not.toBeVisible();

    // Verify top move-up and bottom move-down disabled states in Manual
    const gammaRow = topLevelWrapper.filter({ hasText: "Task Gamma" }).locator("> li");
    const betaRow = topLevelWrapper.filter({ hasText: "Task Beta" }).locator("> li");
    const alphaRow = topLevelWrapper.filter({ hasText: "Task Alpha" }).locator("> li");

    await expect(gammaRow.locator("button[data-testid^='move-up-']")).toBeDisabled();
    await expect(gammaRow.locator("button[data-testid^='move-down-']")).toBeEnabled();
    await expect(alphaRow.locator("button[data-testid^='move-down-']")).toBeDisabled();
    await expect(alphaRow.locator("button[data-testid^='move-up-']")).toBeEnabled();

    // 2. Move top task ("Task Gamma") down one slot and confirm persistence across reload
    await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST" && res.ok()),
      gammaRow.locator("button[data-testid^='move-down-']").click(),
    ]);
    await expect(topLevelTitles).toHaveText(["Task Beta", "Task Gamma", "Task Alpha"]);

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByLabel("Sort by")).toHaveValue("manual");
    await expect(topLevelTitles).toHaveText(["Task Beta", "Task Gamma", "Task Alpha"]);
    await expect(
      topLevelWrapper.filter({ hasText: "Task Beta" }).locator("> li button[data-testid^='move-up-']"),
    ).toBeDisabled();
    await expect(
      topLevelWrapper.filter({ hasText: "Task Alpha" }).locator("> li button[data-testid^='move-down-']"),
    ).toBeDisabled();

    // 3. Add 2 subtasks under "Task Beta" and reorder them persistently
    const betaContainer = topLevelWrapper.filter({ hasText: "Task Beta" });
    for (const subName of ["Sub One", "Sub Two"]) {
      await betaContainer.locator("> li").getByTitle("Add Subtask").click();
      const subForm = betaContainer.locator("form", {
        has: page.getByPlaceholder("New subtask name..."),
      });
      await subForm.getByPlaceholder("New subtask name...").fill(subName);
      await Promise.all([
        page.waitForResponse((res) => res.request().method() === "POST" && res.ok()),
        subForm.getByRole("button", { name: "Add", exact: true }).click(),
      ]);
      await expect(betaContainer.locator("div.pl-6 li", { hasText: subName })).toBeVisible();
    }

    const betaSubTitles = betaContainer.locator("div.pl-6 li span[title]");
    await expect(betaSubTitles).toHaveText(["Sub Two", "Sub One"]);

    const subTwoRow = betaContainer.locator("div.pl-6 li", { hasText: "Sub Two" });
    await expect(subTwoRow.locator("button[data-testid^='move-up-']")).toBeDisabled();
    await expect(subTwoRow.locator("button[data-testid^='move-down-']")).toBeEnabled();

    await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST" && res.ok()),
      subTwoRow.locator("button[data-testid^='move-down-']").click(),
    ]);
    await expect(betaSubTitles).toHaveText(["Sub One", "Sub Two"]);

    await page.reload();
    await waitForHydration(page);
    await expect(topLevelTitles).toHaveText(["Task Beta", "Task Gamma", "Task Alpha"]);
    await expect(
      topLevelWrapper
        .filter({ hasText: "Task Beta" })
        .locator("div.pl-6 li span[title]"),
    ).toHaveText(["Sub One", "Sub Two"]);

    // 4. Switch to Priority: promote "Task Alpha" to High, verify tied-only move behavior
    await page.getByLabel("Sort by").selectOption("priority");
    await expect(switchHint).toBeVisible();

    const alphaPriorityBtn = alphaRow.getByRole("button", { name: "None", exact: true });
    await alphaPriorityBtn.click();
    await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST" && res.ok()),
      page.getByRole("button", { name: "High", exact: true }).click(),
    ]);

    await expect(topLevelTitles).toHaveText(["Task Alpha", "Task Beta", "Task Gamma"]);

    // Task Alpha is the only High task -> both move buttons disabled
    await expect(alphaRow.locator("button[data-testid^='move-up-']")).toBeDisabled();
    await expect(alphaRow.locator("button[data-testid^='move-down-']")).toBeDisabled();

    // Task Beta is top of None tier -> cannot cross into High, can swap down with tied Task Gamma
    await expect(betaRow.locator("button[data-testid^='move-up-']")).toBeDisabled();
    await expect(betaRow.locator("button[data-testid^='move-down-']")).toBeEnabled();

    await Promise.all([
      page.waitForResponse((res) => res.request().method() === "POST" && res.ok()),
      betaRow.locator("button[data-testid^='move-down-']").click(),
    ]);
    await expect(topLevelTitles).toHaveText(["Task Alpha", "Task Gamma", "Task Beta"]);

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByLabel("Sort by")).toHaveValue("priority");
    await expect(topLevelTitles).toHaveText(["Task Alpha", "Task Gamma", "Task Beta"]);
  });
});

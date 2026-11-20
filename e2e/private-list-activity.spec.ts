import { test, expect } from "@playwright/test";
import { addTask, createTestUser, signInAs, suppressWhatsNew } from "./helpers";

test.describe("Private List Activity Log", () => {
  test("signed-in user sees activity entries on private list without IP exposure", async ({
    page,
  }) => {
    await suppressWhatsNew(page);
    const user = createTestUser("priv_act");
    await signInAs(page, user);

    await page.getByRole("button", { name: "Create new list" }).click();
    await page.locator("#create-list-name").fill("Personal Errands");
    await page.getByRole("button", { name: "Create List" }).click();

    await page.locator("aside nav").getByText("Personal Errands").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Personal Errands");

    await addTask(page, "Renew passport");
    const taskItem = page.locator("ul.space-y-2 li", { hasText: "Renew passport" });
    await expect(taskItem).toBeVisible();

    await taskItem.locator("button[data-checked]").click();
    await expect(taskItem).not.toBeVisible();

    await page.getByRole("button", { name: "Activity" }).click();
    await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

    const activityModal = page.locator("div.fixed.inset-0", {
      hasText: "Recent changes to this list (last 90 days). Only you can see this.",
    });
    await expect(activityModal).toBeVisible();
    await expect(activityModal).toContainText("Added a task");
    await expect(activityModal).toContainText("Completed a task");
    await expect(activityModal).toContainText("Renew passport");
    await expect(activityModal).not.toContainText("IP ");

    await page.getByRole("button", { name: "Close activity" }).click();
    await expect(activityModal).not.toBeVisible();
  });
});

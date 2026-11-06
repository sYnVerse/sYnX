import { test, expect } from "@playwright/test";
import { addTask, createTestUser, signInAs, suppressWhatsNew } from "./helpers";

test.describe("Shared Lists Suite", () => {
  test("private list access control redirects unauthorized collaborator", async ({ browser }) => {
    // Context 1: List Owner
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await suppressWhatsNew(ownerPage);

    const owner = createTestUser("owner");
    await signInAs(ownerPage, owner);

    // Create a private list
    await ownerPage.getByRole("button", { name: "Create new list" }).click();
    await ownerPage.locator("#create-list-name").fill("Top Secret Project");
    await ownerPage.getByRole("button", { name: "Create List" }).click();

    // Click the newly created list in sidebar to navigate to its URL
    await ownerPage.locator("aside nav").getByText("Top Secret Project").click();
    await expect(ownerPage.getByRole("heading", { level: 1 })).toContainText("Top Secret Project");

    const ownerListUrl = ownerPage.url();
    const listId = ownerListUrl.split("/").pop();

    // Context 2: Collaborator
    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    await suppressWhatsNew(collabPage);

    const collab = createTestUser("collab");
    await signInAs(collabPage, collab);

    // Collaborator tries to navigate to the private list URL
    await collabPage.goto(`/${listId}`);

    // Collaborator should be redirected away from the private list URL to their own primary list
    await expect(collabPage).not.toHaveURL(`/${listId}`);
    await expect(collabPage.getByRole("heading", { level: 1 })).not.toContainText("Top Secret Project");

    await ownerContext.close();
    await collabContext.close();
  });

  test("view-only (public_read) list restricts edits and appears in Shared with me", async ({ browser }) => {
    // Owner creates list and sets to View-Only
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await suppressWhatsNew(ownerPage);

    const owner = createTestUser("owner_read");
    await signInAs(ownerPage, owner);

    await ownerPage.getByRole("button", { name: "Create new list" }).click();
    await ownerPage.locator("#create-list-name").fill("Published Roadmap");
    await ownerPage.getByRole("button", { name: "Create List" }).click();

    // Click list in sidebar to navigate to it
    await ownerPage.locator("aside nav").getByText("Published Roadmap").click();
    await expect(ownerPage.getByRole("heading", { level: 1 })).toContainText("Published Roadmap");

    const listId = ownerPage.url().split("/").pop();

    // Change share mode to View-Only
    await ownerPage.getByRole("button", { name: /^Share List/ }).click();
    await ownerPage.getByRole("button", { name: /View-Only/i }).click();
    await expect(ownerPage.getByRole("button", { name: /^Share List/ })).toContainText("View-Only");

    // Collaborator visits the list
    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    await suppressWhatsNew(collabPage);

    const collab = createTestUser("collab_read");
    await signInAs(collabPage, collab);

    await collabPage.goto(`/${listId}`);

    // View-Only banner should be visible and task input form hidden
    await expect(collabPage.getByText("👁 View-Only Access")).toBeVisible();
    await expect(collabPage.getByPlaceholder("What needs to be done?")).not.toBeVisible();

    // List should appear under "Shared with me" in the sidebar
    await expect(collabPage.locator("aside nav").getByText("Published Roadmap")).toBeVisible();

    await ownerContext.close();
    await collabContext.close();
  });

  test("collaborative (public_edit) workflow: task edits, delete approval flow, activity log, and remove shared list", async ({
    browser,
  }) => {
    // 1. Owner creates list and sets to Collaborative
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await suppressWhatsNew(ownerPage);

    const owner = createTestUser("owner_collab");
    await signInAs(ownerPage, owner);

    await ownerPage.getByRole("button", { name: "Create new list" }).click();
    await ownerPage.locator("#create-list-name").fill("Team Sprint");
    await ownerPage.getByRole("button", { name: "Create List" }).click();

    // Click list in sidebar to navigate to it
    await ownerPage.locator("aside nav").getByText("Team Sprint").click();
    await expect(ownerPage.getByRole("heading", { level: 1 })).toContainText("Team Sprint");

    const listId = ownerPage.url().split("/").pop();

    // Owner adds a task
    await addTask(ownerPage, "Owner Critical Task");
    await expect(ownerPage.locator("ul.space-y-2 li", { hasText: "Owner Critical Task" })).toBeVisible();

    // Change to Collaborative
    await ownerPage.getByRole("button", { name: /^Share List/ }).click();
    await ownerPage.getByRole("button", { name: /Collaborative/i }).click();
    await expect(ownerPage.getByRole("button", { name: /^Share List/ })).toContainText("Collaborative");

    // 2. Collaborator joins the collaborative list
    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    await suppressWhatsNew(collabPage);

    const collab = createTestUser("collab_editor");
    await signInAs(collabPage, collab);

    await collabPage.goto(`/${listId}`);
    await expect(collabPage.getByRole("heading", { level: 1 })).toContainText("Team Sprint");

    // Collaborator can add a task
    await addTask(collabPage, "Collaborator Task");
    await expect(collabPage.locator("ul.space-y-2 li", { hasText: "Collaborator Task" })).toBeVisible();

    // Collaborator can delete their own task directly
    const collabOwnTask = collabPage.locator("ul.space-y-2 li", { hasText: "Collaborator Task" });
    await collabOwnTask.hover();
    await collabOwnTask.getByTitle("Delete task").click();
    await expect(collabPage.locator("ul.space-y-2 li", { hasText: "Collaborator Task" })).not.toBeVisible();

    // Collaborator attempts to delete Owner's task -> sends request to owner
    const ownerTaskItem = collabPage.locator("ul.space-y-2 li", { hasText: "Owner Critical Task" });
    await ownerTaskItem.hover();
    const requestDeleteBtn = ownerTaskItem.getByTitle("Request delete (owner must approve)");
    await expect(requestDeleteBtn).toBeVisible();
    await requestDeleteBtn.click();

    // Task now shows "Delete requested" badge
    await expect(ownerTaskItem.getByText("Delete requested")).toBeVisible();

    // 3. Owner handles delete request (Decline first)
    await ownerPage.goto(`/${listId}`);
    const deleteRequestsSection = ownerPage.locator("section[aria-label='Pending delete requests']");
    await expect(deleteRequestsSection).toBeVisible();
    await deleteRequestsSection.getByRole("button", { name: "Decline" }).click();
    await expect(deleteRequestsSection).not.toBeVisible();
    await expect(ownerPage.locator("ul.space-y-2 li", { hasText: "Owner Critical Task" })).toBeVisible();

    // Collaborator requests delete again
    await collabPage.goto(`/${listId}`);
    await collabPage.locator("ul.space-y-2 li", { hasText: "Owner Critical Task" }).hover();
    await collabPage.locator("ul.space-y-2 li", { hasText: "Owner Critical Task" }).getByTitle("Request delete (owner must approve)").click();
    await expect(collabPage.locator("ul.space-y-2 li", { hasText: "Owner Critical Task" }).getByText("Delete requested")).toBeVisible();

    // Owner approves the delete request
    await ownerPage.goto(`/${listId}`);
    const pendingSection = ownerPage.locator("section[aria-label='Pending delete requests']");
    await expect(pendingSection).toBeVisible();
    await pendingSection.getByRole("button", { name: "Approve" }).click();
    await expect(pendingSection).not.toBeVisible();

    // Confirm task is deleted for Owner from the task list
    await expect(ownerPage.locator("ul.flex-1 li", { hasText: "Owner Critical Task" })).not.toBeVisible();

    // 4. Verify Owner Activity Log
    await ownerPage.getByRole("button", { name: "Activity" }).click();
    await expect(ownerPage.getByRole("heading", { name: "Activity" })).toBeVisible();
    // Activity modal should contain log entries
    const activityModal = ownerPage.locator("div.fixed.inset-0", { hasText: "Who changed this shared list" });
    await expect(activityModal).toBeVisible();
    await ownerPage.getByRole("button", { name: "Close activity" }).click();

    // 5. Collaborator removes the shared list from "Shared with me"
    await collabPage.goto(`/${listId}`);
    const sharedRow = collabPage.locator("aside nav").locator("div.group", { hasText: "Team Sprint" });
    await sharedRow.hover();
    await sharedRow.getByTitle("Remove from Shared with me").click();

    // Confirm list is removed from Collaborator's sidebar
    await expect(collabPage.locator("aside nav").getByText("Team Sprint")).not.toBeVisible();

    await ownerContext.close();
    await collabContext.close();
  });

  test("permission revocation: owner changing list back to private revokes collaborator access", async ({ browser }) => {
    // 1. Owner creates list and sets to Collaborative
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await suppressWhatsNew(ownerPage);

    const owner = createTestUser("owner_revoke");
    await signInAs(ownerPage, owner);

    await ownerPage.getByRole("button", { name: "Create new list" }).click();
    await ownerPage.locator("#create-list-name").fill("Confidential Project");
    await ownerPage.getByRole("button", { name: "Create List" }).click();

    await ownerPage.locator("aside nav").getByText("Confidential Project").click();
    await expect(ownerPage.getByRole("heading", { level: 1 })).toContainText("Confidential Project");

    const listId = ownerPage.url().split("/").pop();

    await ownerPage.getByRole("button", { name: /^Share List/ }).click();
    await ownerPage.getByRole("button", { name: /Collaborative/i }).click();
    await expect(ownerPage.getByRole("button", { name: /^Share List/ })).toContainText("Collaborative");

    // 2. Collaborator accesses the collaborative list
    const collabContext = await browser.newContext();
    const collabPage = await collabContext.newPage();
    await suppressWhatsNew(collabPage);

    const collab = createTestUser("collab_revoke");
    await signInAs(collabPage, collab);

    await collabPage.goto(`/${listId}`);
    await expect(collabPage.getByRole("heading", { level: 1 })).toContainText("Confidential Project");
    await expect(collabPage.locator("aside nav").getByText("Confidential Project")).toBeVisible();

    // 3. Owner revokes access by changing share mode back to Private
    await ownerPage.goto(`/${listId}`);
    await ownerPage.getByRole("button", { name: /^Share List/ }).click();
    await ownerPage.getByRole("button", { name: /Private/i }).click();
    await expect(ownerPage.getByRole("button", { name: /^Share List/ })).toContainText("Private");

    // 4. Collaborator tries to access the list -> redirected away and access blocked
    await collabPage.goto(`/${listId}`);
    await expect(collabPage).not.toHaveURL(`/${listId}`);
    await expect(collabPage.getByRole("heading", { level: 1 })).not.toContainText("Confidential Project");
    await expect(collabPage.locator("aside nav").getByText("Confidential Project")).not.toBeVisible();

    await ownerContext.close();
    await collabContext.close();
  });
});

import type { Page } from "@playwright/test";
import { randomBytes } from "crypto";
import { WEB_VERSION } from "../app/constants/changelog";

export interface TestUser {
  userId: string;
  email: string;
  displayName?: string;
}

export function createTestUser(prefix = "user"): TestUser {
  const nonce = `${Date.now()}_${randomBytes(4).toString("hex")}`;
  return {
    userId: `e2e_${prefix}_${nonce}`,
    email: `e2e_${prefix}_${nonce}@example.com`,
    displayName: `E2E ${prefix} ${nonce.slice(-4)}`,
  };
}

export async function suppressWhatsNew(page: Page): Promise<void> {
  await page.addInitScript((version) => {
    window.localStorage.setItem("last_seen_changelog_version", version);
  }, WEB_VERSION);
}

export async function signInAs(
  page: Page,
  user?: TestUser,
  options?: { redirectTo?: string; suggestedName?: string }
): Promise<TestUser> {
  const resolved = user ?? createTestUser();
  const searchParams = new URLSearchParams({
    test_login: "true",
    test_user_id: resolved.userId,
    test_email: resolved.email,
  });
  if (resolved.displayName) {
    searchParams.set("test_display_name", resolved.displayName);
  }
  if (options?.suggestedName) {
    searchParams.set("test_suggested_name", options.suggestedName);
  }
  if (options?.redirectTo) {
    searchParams.set("redirectTo", options.redirectTo);
  }
  await page.goto(`/login?${searchParams.toString()}`);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
  return resolved;
}

export async function addTask(page: Page, text: string): Promise<void> {
  const taskInput = page.getByPlaceholder("What needs to be done?");
  const addButton = page.getByRole("button", { name: "Add", exact: true });
  await taskInput.fill(text);
  await addButton.click();
  await page.locator("li", { hasText: text }).waitFor({ state: "visible" });
  // Wait until input has been reset after submission
  await page.waitForFunction(
    () => (document.querySelector("input[name='text']") as HTMLInputElement)?.value === "",
    null,
    { timeout: 5000 }
  );
}


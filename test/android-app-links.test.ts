import { describe, it, expect } from "vitest";
import appJson from "../mobile/app.json";
import { parseDeepLinkUrl } from "../shared";

/**
 * Android matches an intent filter's `android:pathPattern` with
 * PatternMatcher.PATTERN_SIMPLE_GLOB against the whole URL path (no query):
 * `.` is any single character, `x*` is zero or more of `x`, `\` escapes.
 * This mirrors that so we can check which web paths open the app.
 */
function androidSimpleGlobMatches(pattern: string, path: string): boolean {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) {
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    } else if (ch === ".") {
      source += "[\\s\\S]";
    } else if (ch === "*") {
      source += "*";
    } else {
      source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`).test(path);
}

type IntentData = { scheme?: string; host?: string; pathPrefix?: string; pathPattern?: string };

const viewFilter = appJson.expo.android.intentFilters.find((f) => f.action === "VIEW");
const appLinkData = (viewFilter?.data ?? []) as IntentData[];

function opensApp(path: string): boolean {
  return appLinkData.some((d) => {
    if (d.scheme !== "https" || d.host !== "synx.christran.io") return false;
    if (d.pathPrefix) return path.startsWith(d.pathPrefix);
    if (d.pathPattern) return androidSimpleGlobMatches(d.pathPattern, path);
    return true; // a host-only entry would catch every path
  });
}

const LIST_ID = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";

describe("Android App Links for shared list URLs", () => {
  it("is a verified https filter for synx.christran.io only", () => {
    expect(viewFilter?.autoVerify).toBe(true);
    expect(viewFilter?.category).toEqual(expect.arrayContaining(["BROWSABLE", "DEFAULT"]));
    for (const d of appLinkData) {
      expect(d.scheme).toBe("https");
      expect(d.host).toBe("synx.christran.io");
      // Every entry must narrow the path, or the app would grab the whole site.
      expect(Boolean(d.pathPrefix || d.pathPattern)).toBe(true);
    }
  });

  it("opens the app for plain list links and the existing paths", () => {
    expect(opensApp(`/${LIST_ID}`)).toBe(true);
    expect(opensApp(`/${LIST_ID.toUpperCase()}`)).toBe(true);
    expect(opensApp(`/${crypto.randomUUID()}`)).toBe(true);
    expect(opensApp(`/list/${LIST_ID}`)).toBe(true);
    expect(opensApp("/mobile/callback")).toBe(true);
  });

  it("leaves the website's other pages in the browser", () => {
    for (const path of [
      "/",
      "/login",
      "/logout",
      "/callback",
      "/api/v1/lists",
      `/api/v1/lists/${LIST_ID}`,
      `/api/v1/todos/${LIST_ID}`,
      "/.well-known/assetlinks.json",
      `/guest_${LIST_ID}`,
      `/${LIST_ID}/`,
      `/${LIST_ID}x`,
      `/${LIST_ID.slice(0, -1)}`,
      "/privacy",
      "/terms",
    ]) {
      expect(opensApp(path), path).toBe(false);
    }
  });

  it("the app's link parser opens the list for those URLs", () => {
    expect(parseDeepLinkUrl(`https://synx.christran.io/${LIST_ID}`)).toEqual({
      listId: LIST_ID,
      action: null,
    });
    expect(parseDeepLinkUrl(`https://synx.christran.io/${LIST_ID}?action=newTask`)).toEqual({
      listId: LIST_ID,
      action: "newTask",
    });
    expect(parseDeepLinkUrl(`https://synx.christran.io/list/${LIST_ID}`).listId).toBe(LIST_ID);
  });
});

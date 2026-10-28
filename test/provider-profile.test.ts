import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import {
  acceptSuggestedDisplayName,
  dismissSuggestedDisplayName,
  fetchProviderProfile,
  providerProfileFields,
  sanitizeProviderAvatarUrl,
  syncProviderProfile,
} from "../app/provider-profile.server";
import { getSharedNameNotice, isMakingListPublic } from "../shared";

const ISSUER = "https://auth.example.test";

function jsonFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

async function settingsRow(userId: string) {
  return env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(userId).first<any>();
}

describe("provider avatar allowlist", () => {
  it("keeps https Google/GitHub photos and drops anything else", () => {
    expect(sanitizeProviderAvatarUrl("https://lh3.googleusercontent.com/a/x=s96-c")).toBe(
      "https://lh3.googleusercontent.com/a/x=s96-c"
    );
    expect(sanitizeProviderAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe(
      "https://avatars.githubusercontent.com/u/1?v=4"
    );
    expect(sanitizeProviderAvatarUrl("http://lh3.googleusercontent.com/a/x")).toBeNull();
    expect(sanitizeProviderAvatarUrl("https://googleusercontent.com.evil.test/a")).toBeNull();
    expect(sanitizeProviderAvatarUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("fetchProviderProfile", () => {
  it("returns null when sYnID has no /userinfo yet (404) or errors", async () => {
    expect(await fetchProviderProfile(ISSUER, "t", jsonFetch(404, { error: "not_found" }))).toBeNull();
    const failing = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(await fetchProviderProfile(ISSUER, "t", failing)).toBeNull();
  });
});

describe("syncProviderProfile and the display name suggestion", () => {
  it("stores photo and suggestion without ever setting display_name", async () => {
    const userId = "provider-user-1";
    await syncProviderProfile(env.DB, {
      userId,
      email: "p1@example.com",
      accessToken: "t",
      issuer: ISSUER,
      fetchImpl: jsonFetch(200, {
        name: "  Ada Lovelace ",
        picture: "https://lh3.googleusercontent.com/a/ada",
      }),
    });
    const row = await settingsRow(userId);
    expect(row.display_name).toBeNull();
    expect(row.suggested_display_name).toBe("Ada Lovelace");
    expect(providerProfileFields(row)).toEqual({
      avatarUrl: "https://lh3.googleusercontent.com/a/ada",
      suggestedDisplayName: "Ada Lovelace",
    });

    expect(await acceptSuggestedDisplayName(env.DB, userId)).toBe(true);
    const accepted = await settingsRow(userId);
    expect(accepted.display_name).toBe("Ada Lovelace");
    expect(providerProfileFields(accepted).suggestedDisplayName).toBeNull();
  });

  it("never replaces a display name the user set, and dismiss stops the offer", async () => {
    const userId = "provider-user-2";
    await env.DB.prepare("INSERT INTO user_settings (user_id, email, display_name) VALUES (?, ?, ?)")
      .bind(userId, "p2@example.com", "Chosen Name")
      .run();
    await syncProviderProfile(env.DB, {
      userId,
      email: "p2@example.com",
      accessToken: "t",
      issuer: ISSUER,
      fetchImpl: jsonFetch(200, { name: "Provider Name", picture: null }),
    });
    expect(await acceptSuggestedDisplayName(env.DB, userId)).toBe(false);
    expect((await settingsRow(userId)).display_name).toBe("Chosen Name");

    const other = "provider-user-3";
    await syncProviderProfile(env.DB, {
      userId: other,
      email: "p3@example.com",
      accessToken: "t",
      issuer: ISSUER,
      fetchImpl: jsonFetch(200, { name: "Grace", picture: null }),
    });
    await dismissSuggestedDisplayName(env.DB, other);
    expect(providerProfileFields(await settingsRow(other)).suggestedDisplayName).toBeNull();
  });

  it("skips the network inside the throttle window", async () => {
    const userId = "provider-user-4";
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
    const base = { userId, email: "p4@example.com", accessToken: "t", issuer: ISSUER, fetchImpl: counting };
    await syncProviderProfile(env.DB, { ...base, now: 1_000_000 });
    await syncProviderProfile(env.DB, { ...base, now: 1_000_000 + 60_000 });
    expect(calls).toBe(1);
  });
});

describe("shared list name notice", () => {
  it("flags Private → shared and mentions the display name, never email", () => {
    expect(isMakingListPublic("private", "public_read")).toBe(true);
    expect(isMakingListPublic("public_read", "public_edit")).toBe(false);
    expect(getSharedNameNotice("public_edit", "Chris")).toContain('"Chris"');
    expect(getSharedNameNotice("private")).toContain("anyone with the link");
  });
});

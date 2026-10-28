import { describe, it, expect } from "vitest";
import { getProfileLabel } from "../app/profile-label";

describe("getProfileLabel", () => {
  it("shows the display name over the email when one is set", () => {
    expect(
      getProfileLabel({ email: "chris@example.com", displayName: "Chris Tran", displayNameSet: true })
    ).toEqual({ primary: "Chris Tran", secondary: "chris@example.com", initials: "CT" });
  });

  it("keeps the email and Synced Profile when no display name is set", () => {
    expect(
      getProfileLabel({ email: "chris@example.com", displayName: "sYnX user", displayNameSet: false })
    ).toEqual({ primary: "chris@example.com", secondary: "Synced Profile", initials: "CH" });
  });

  it("uses the first two letters of a one-word name", () => {
    expect(
      getProfileLabel({ email: "chris@example.com", displayName: "sYnVerse", displayNameSet: true }).initials
    ).toBe("SY");
  });
});

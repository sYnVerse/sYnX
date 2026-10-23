import { describe, it, expect } from "vitest";
import {
  getListPermissionPresentation,
  getShareModeLabel,
} from "../shared/list-permissions";

describe("getListPermissionPresentation", () => {
  it("shows private copy for owners", () => {
    const p = getListPermissionPresentation({
      shareMode: "private",
      isOwner: true,
      canEdit: true,
    });
    expect(p.label).toBe("Private");
    expect(p.icon).toBe("lock");
    expect(p.tone).toBe("private");
    expect(p.description).toMatch(/Only you/i);
  });

  it("shows view-only copy for non-owners on public_read", () => {
    const p = getListPermissionPresentation({
      shareMode: "public_read",
      isOwner: false,
      canEdit: false,
    });
    expect(p.label).toBe("View-Only");
    expect(p.icon).toBe("eye");
    expect(p.tone).toBe("view_only");
    expect(p.description).toMatch(/Editing is disabled/i);
  });

  it("shows owner-facing view-only sharing status", () => {
    const p = getListPermissionPresentation({
      shareMode: "public_read",
      isOwner: true,
      canEdit: true,
    });
    expect(p.label).toBe("View-Only");
    expect(p.description).toMatch(/Anyone with the link can view/i);
  });

  it("shows collaborative copy for non-owners on public_edit", () => {
    const p = getListPermissionPresentation({
      shareMode: "public_edit",
      isOwner: false,
      canEdit: true,
    });
    expect(p.label).toBe("Collaborative");
    expect(p.icon).toBe("users");
    expect(p.tone).toBe("collaborative");
    expect(p.description).toMatch(/shared collaborative/i);
  });

  it("shows collaborative sharing status for owners", () => {
    const p = getListPermissionPresentation({
      shareMode: "public_edit",
      isOwner: true,
      canEdit: true,
    });
    expect(p.label).toBe("Collaborative");
    expect(p.description).toMatch(/Anyone with the link can view and edit/i);
  });
});

describe("getShareModeLabel", () => {
  it("maps modes to picker labels", () => {
    expect(getShareModeLabel("private")).toBe("Private");
    expect(getShareModeLabel("public_read")).toBe("View-Only");
    expect(getShareModeLabel("public_edit")).toBe("Collaborative");
  });
});

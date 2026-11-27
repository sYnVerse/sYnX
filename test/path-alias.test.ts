import { describe, it, expect } from "vitest";
// Both imports name the same file on purpose: the test checks they resolve to it.
/* eslint-disable import/no-duplicates */
import * as viaAlias from "~/profile-label";
import * as viaRelative from "../web/app/profile-label";
/* eslint-enable import/no-duplicates */
// This module imports its own dependencies through ~/ too.
import { action as listAction } from "~/features/list/action.server";

// Guards the `~/` alias in vitest.config.ts. App code imports with `~/...`
// (tsconfig.json `paths`), so if the alias stops resolving, tests that load
// those modules fail to start. This fails first, with a clear reason.
describe("~/ path alias", () => {
  it("resolves ~/ to web/app/ as the same module instance as a relative import", () => {
    expect(viaAlias.getProfileLabel).toBe(viaRelative.getProfileLabel);
  });

  it("loads app modules that import other modules through ~/", () => {
    expect(typeof listAction).toBe("function");
  });
});

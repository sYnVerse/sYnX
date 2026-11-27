import { describe, expect, it } from "vitest";
import pkgJson from "../package.json";
import webPkgJson from "../web/package.json";
import eslintConfigRaw from "../eslint.config.js?raw";
import viteConfigRaw from "../web/vite.config.ts?raw";
import todoPageRaw from "../web/app/features/list/TodoPage.tsx?raw";
import useGuestListsRaw from "../web/app/features/list/hooks/useGuestLists.ts?raw";
import useOptimisticFieldRaw from "../web/app/features/list/hooks/useOptimisticField.ts?raw";
import useFetcherToastRaw from "../web/app/features/list/hooks/useFetcherToast.ts?raw";
import {
  COMPILER_RUNTIME_MARKER,
  verifyReactCompilerAssets,
} from "../scripts/verify-react-compiler-bundle.mjs";

describe("web React Compiler configuration (#171, #227)", () => {
  it("pins React Compiler 1.0 and its Vite/Babel toolchain to exact versions", () => {
    const rootDevDeps = pkgJson.devDependencies as Record<string, string>;
    const webDevDeps = webPkgJson.devDependencies as Record<string, string>;
    expect(webDevDeps["babel-plugin-react-compiler"]).toBe("1.0.0");
    expect(webDevDeps["vite-plugin-babel"]).toBe("1.7.3");
    expect(webDevDeps["@babel/preset-typescript"]).toBe("7.29.7");
    expect(rootDevDeps.typescript).toBe("6.0.3");
  });

  it("wires babel-plugin-react-compiler in vite.config.ts before reactRouter() using default target", () => {
    expect(viteConfigRaw).toContain("babel-plugin-react-compiler");
    expect(viteConfigRaw).toContain("@babel/preset-typescript");
    expect(viteConfigRaw).not.toContain('target: "19"');

    const babelIndex = viteConfigRaw.indexOf("babel(");
    const reactRouterIndex = viteConfigRaw.indexOf("reactRouter(");
    expect(babelIndex).toBeGreaterThan(-1);
    expect(reactRouterIndex).toBeGreaterThan(babelIndex);
  });

  it("enables strict React Compiler ESLint rules as errors", () => {
    expect(eslintConfigRaw).toContain("recommended-latest");
    expect(eslintConfigRaw).toContain('"react-hooks/incompatible-library": "error"');
    expect(eslintConfigRaw).toContain('"react-hooks/unsupported-syntax": "error"');
  });

  it("compiles core web list modules without opt-outs or disabled react-hooks rules", () => {
    for (const [name, source] of [
      ["TodoPage.tsx", todoPageRaw],
      ["useGuestLists.ts", useGuestListsRaw],
      ["useOptimisticField.ts", useOptimisticFieldRaw],
      ["useFetcherToast.ts", useFetcherToastRaw],
    ] as const) {
      expect(source, `${name} should not opt out with use no memo`).not.toContain("use no memo");
      expect(source, `${name} should not disable react-hooks lint rules`).not.toMatch(
        /eslint-disable[^\n]*react-hooks/
      );
    }

    // Confirm TodoPage uses useFetcherToast instead of direct synchronous setState in effects
    expect(todoPageRaw).toContain("useFetcherToast(");
    // Confirm useOptimisticField avoids try/finally which blocks compiler optimization
    expect(useOptimisticFieldRaw).not.toMatch(/\bfinally\s*\{/);
  });

  it("verifies compiled TodoPage assets contain React Compiler runtime and rejects uncompiled bundles", () => {
    expect(() =>
      verifyReactCompilerAssets({ "TodoPage-abc.js": "console.log('plain');" })
    ).toThrow(/react\.memo_cache_sentinel/);

    expect(() => verifyReactCompilerAssets({ "other-abc.js": "console.log(1);" })).toThrow(
      /TodoPage-\*\.js/
    );

    expect(
      verifyReactCompilerAssets({
        "TodoPage-abc.js": `const x = Symbol.for("${COMPILER_RUNTIME_MARKER}");`,
        "root-xyz.js": "console.log('ok');",
      })
    ).toEqual({
      checkedFiles: ["TodoPage-abc.js", "root-xyz.js"],
      todoPageFile: "TodoPage-abc.js",
    });
  });
});

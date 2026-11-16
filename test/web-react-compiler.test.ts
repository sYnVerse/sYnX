import { describe, expect, it } from "vitest";
import pkgJson from "../package.json";
import eslintConfigRaw from "../eslint.config.js?raw";
import viteConfigRaw from "../vite.config.ts?raw";
import todoPageRaw from "../app/features/list/TodoPage.tsx?raw";
import useGuestListsRaw from "../app/features/list/hooks/useGuestLists.ts?raw";
import useOptimisticFieldRaw from "../app/features/list/hooks/useOptimisticField.ts?raw";
import useFetcherToastRaw from "../app/features/list/hooks/useFetcherToast.ts?raw";

describe("web React Compiler configuration (#171)", () => {
  it("pins React Compiler 1.0 and its Vite/Babel toolchain to exact versions", () => {
    const devDeps = pkgJson.devDependencies as Record<string, string>;
    expect(devDeps["babel-plugin-react-compiler"]).toBe("1.0.0");
    expect(devDeps["vite-plugin-babel"]).toBe("1.7.3");
    expect(devDeps["@babel/preset-typescript"]).toBe("7.29.7");
    expect(devDeps.typescript).toBe("5.8.3");
  });

  it("wires babel-plugin-react-compiler in vite.config.ts before reactRouter()", () => {
    expect(viteConfigRaw).toContain("babel-plugin-react-compiler");
    expect(viteConfigRaw).toContain("@babel/preset-typescript");
    expect(viteConfigRaw).toContain('target: "19"');

    const babelIndex = viteConfigRaw.indexOf("babel(");
    const reactRouterIndex = viteConfigRaw.indexOf("reactRouter(");
    expect(babelIndex).toBeGreaterThan(-1);
    expect(reactRouterIndex).toBeGreaterThan(babelIndex);
  });

  it("enables strict React Compiler ESLint rules as errors", () => {
    expect(eslintConfigRaw).toContain('recommended-latest');
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
});

import path from "node:path";
import { pathToFileURL } from "node:url";

export const COMPILER_RUNTIME_MARKER = "react.memo_cache_sentinel";

/**
 * Pure verifier for built client JS assets (`{ [fileName]: content }`) so
 * both the Node CLI script and Vitest (`workerd`) unit tests can exercise it.
 *
 * @param {Record<string, string>} assets
 * @param {string} [assetsDirLabel]
 */
export function verifyReactCompilerAssets(
  assets,
  assetsDirLabel = "web/build/client/assets"
) {
  const jsFiles = Object.keys(assets)
    .filter((name) => name.endsWith(".js"))
    .sort();

  const todoPageFiles = jsFiles.filter((name) => /^TodoPage-.*\.js$/.test(name));
  if (todoPageFiles.length === 0) {
    throw new Error(
      `Expected a built TodoPage-*.js asset in ${assetsDirLabel}, found: ${jsFiles.join(", ") || "(none)"}`
    );
  }

  for (const fileName of todoPageFiles) {
    const content = assets[fileName] ?? "";
    if (!content.includes(COMPILER_RUNTIME_MARKER)) {
      throw new Error(
        `React Compiler runtime marker (${COMPILER_RUNTIME_MARKER}) missing from ${fileName}. ` +
          `Check vite.config.ts babel-plugin-react-compiler plugin ordering.`
      );
    }
  }

  return { checkedFiles: jsFiles, todoPageFile: todoPageFiles[0] };
}

/**
 * Verifies the Babel + React Compiler transform directly in Node and checks
 * the built client assets directory for React Compiler runtime output.
 *
 * @param {string} [clientAssetsDir]
 */
export async function runCli(clientAssetsDir) {
  const fs = await import("node:fs");
  const { transformSync } = await import("@babel/core");
  const presetTypescript = (await import("@babel/preset-typescript")).default;
  const reactCompiler = (await import("babel-plugin-react-compiler")).default;

  const sample = transformSync(
    "export function SampleWidget({ title }: { title: string }) { return <div>{title}</div>; }",
    {
      filename: "SampleWidget.tsx",
      configFile: false,
      babelrc: false,
      presets: [[presetTypescript, { isTSX: true, allExtensions: true }]],
      plugins: [reactCompiler],
    }
  );
  if (
    !sample?.code ||
    !sample.code.includes("react/compiler-runtime") ||
    !sample.code.includes("_c(")
  ) {
    throw new Error("React Compiler Babel transform failed to emit react/compiler-runtime memo cache.");
  }

  if (process.argv.includes("--transform-only")) {
    console.log("[verify-react-compiler-bundle] Verified Babel + React Compiler transform.");
    return;
  }

  const targetDir = clientAssetsDir ?? path.resolve(process.cwd(), "web", "build", "client", "assets");
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Client assets directory not found at ${targetDir}. Run "npm run build" first.`);
  }
  /** @type {Record<string, string>} */
  const assets = {};
  for (const name of fs.readdirSync(targetDir)) {
    if (name.endsWith(".js")) {
      assets[name] = fs.readFileSync(path.join(targetDir, name), "utf8");
    }
  }

  const result = verifyReactCompilerAssets(assets, targetDir);
  console.log(
    `[verify-react-compiler-bundle] Verified Babel transform and React Compiler runtime in ${result.todoPageFile} (${result.checkedFiles.length} JS assets).`
  );
}

if (
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

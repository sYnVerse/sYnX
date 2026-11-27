import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "vite-plugin-babel";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      configPath: "../backend/wrangler.jsonc",
      persistState: { path: "../backend/.wrangler/state" },
    }),
    babel({
      include: [/[\\/]app[\\/].*\.[jt]sx?$/],
      exclude: [/node_modules/, /\.test\.[jt]sx?$/, /\.server\.[jt]sx?$/],
      babelConfig: {
        presets: [
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
        ],
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    reactRouter(),
  ].filter(Boolean) as PluginOption[],
  ssr: {
    resolve: {
      conditions: ["workerd", "worker", "browser"],
    },
  },
  resolve: {
    tsconfigPaths: true,
    mainFields: ["browser", "module", "main"],
  },
  build: {
    minify: true,
  },
});

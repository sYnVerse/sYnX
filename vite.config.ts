import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "vite-plugin-babel";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      configPath: "./wrangler.jsonc",
    }),
    babel({
      include: [/[\\/]app[\\/].*\.[jt]sx?$/],
      exclude: [/node_modules/, /\.test\.[jt]sx?$/, /\.server\.[jt]sx?$/],
      babelConfig: {
        presets: [
          ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
        ],
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
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

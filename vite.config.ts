import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      configPath: "./wrangler.jsonc",
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

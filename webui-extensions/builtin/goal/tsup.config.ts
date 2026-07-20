import { defineConfig } from "tsup"

const shared = {
  format: "esm" as const,
  target: "es2022" as const,
  bundle: true,
  splitting: false,
  sourcemap: false,
  outExtension: () => ({ js: ".mjs" }),
  noExternal: ["@pi-web-codex/extension-sdk"],
}

export default defineConfig([
  {
    ...shared,
    entry: { worker: "src/worker.ts" },
    platform: "node",
    clean: true,
  },
  {
    ...shared,
    entry: { client: "src/client.ts" },
    platform: "browser",
    clean: false,
  },
])

import { defineConfig } from "tsup"

export default defineConfig({
  entry: { worker: "src/worker.ts" },
  format: "esm",
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: false,
  splitting: false,
  outExtension: () => ({ js: ".mjs" }),
  noExternal: [
    "@workspace/runtime-protocol",
    "@workspace/worker-common",
    "@xterm/headless",
    "@xterm/addon-serialize",
  ],
})

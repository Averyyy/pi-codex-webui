import { defineConfig } from "tsup"

export default defineConfig((options) => ({
  entry: ["src/index.ts", "src/react.ts", "src/testing.ts"],
  format: "esm",
  platform: "neutral",
  target: "es2022",
  clean: !options.watch,
  dts: true,
  sourcemap: false,
}))

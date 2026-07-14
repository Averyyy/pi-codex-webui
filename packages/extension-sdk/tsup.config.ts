import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/react.ts", "src/testing.ts"],
  format: "esm",
  platform: "neutral",
  target: "es2022",
  clean: true,
  dts: true,
  sourcemap: false,
})

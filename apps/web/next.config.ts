import type { NextConfig } from "next"
import { realpathSync } from "node:fs"
import path from "node:path"

const nodePtyPrebuilds = path
  .relative(
    import.meta.dirname,
    realpathSync(
      path.join(import.meta.dirname, "node_modules/node-pty/prebuilds")
    )
  )
  .split(path.sep)
  .join("/")

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingExcludes: {
    "/*": [
      "./app/**/*",
      "./components/**/*",
      "./hooks/**/*",
      "./lib/**/*",
      "./components.json",
      "./eslint.config.js",
      "./next.config.ts",
      "./postcss.config.mjs",
      "./tsconfig.json",
      "../../webui-extensions/**/*",
    ],
  },
  outputFileTracingIncludes: {
    "/api/v1/sessions/*/terminal": [`${nodePtyPrebuilds}/**/*`],
  },
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@pi-web-codex/extension-sdk",
    "@workspace/runtime-protocol",
    "@workspace/ui",
  ],
}

export default nextConfig

import type { NextConfig } from "next"
import { realpathSync } from "node:fs"
import path from "node:path"

const nodePtyPackage = path
  .relative(
    import.meta.dirname,
    realpathSync(path.join(import.meta.dirname, "node_modules/node-pty"))
  )
  .split(path.sep)
  .join("/")
const nodePtyPrebuilds = `${nodePtyPackage}/prebuilds`
const nodePtyBuild = `${nodePtyPackage}/build/Release`

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  serverExternalPackages: ["node-pty"],
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
    "/api/v1/sessions/*/terminal": [
      `${nodePtyPrebuilds}/**/*`,
      `${nodePtyBuild}/*.node`,
      `${nodePtyBuild}/spawn-helper`,
    ],
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

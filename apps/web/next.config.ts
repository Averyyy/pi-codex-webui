import type { NextConfig } from "next"
import path from "node:path"

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingExcludes: {
    "/*": [
      "./app/**/*",
      "./components/**/*",
      "./lib/**/*",
      "./components.json",
      "./eslint.config.js",
      "./next.config.ts",
      "./postcss.config.mjs",
      "./tsconfig.json",
      "../../webui-extensions/**/*",
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

import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cliPath = join(packageRoot, "bin", "pi-web-codex.mjs")
const DEFAULT_URL = "http://127.0.0.1:1816"

export default function piWebCodexExtension(pi: ExtensionAPI): void {
  pi.registerCommand("pi-web-codex", {
    description: "Start the pi-web-codex local web host and print its URL",
    async handler(_args, ctx) {
      const child = spawn(process.execPath, [cliPath], {
        detached: true,
        stdio: "ignore",
        env: process.env,
      })
      child.unref()

      const url = await waitForHealth(DEFAULT_URL)
      if (!url) {
        ctx.ui.notify(
          "pi-web-codex did not become ready. Try `npx pi-web-codex` in a terminal.",
          "error"
        )
        return
      }
      ctx.ui.notify(`pi-web-codex is ready at ${url}`, "info")
    },
  })
}

async function waitForHealth(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/v1/health`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok && (await response.json()).name === "pi-web-codex") {
        return url
      }
    } catch {
      // The host is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

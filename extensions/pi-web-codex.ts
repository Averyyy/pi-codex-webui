import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cliPath = join(packageRoot, "bin", "pi-web-codex.mjs")

type CliMessage =
  { type: "ready"; url: string } | { type: "error"; message: string }

export default function piWebCodexExtension(pi: ExtensionAPI): void {
  pi.registerCommand("pi-web-codex", {
    description: "Start the pi-web-codex local web host and print its URL",
    async handler(_args, ctx) {
      const child = spawn(process.execPath, [cliPath], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: process.env,
      })
      child.unref()

      try {
        const url = await waitForReady(child)
        ctx.ui.notify(`pi-web-codex is ready at ${url}`, "info")
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.ui.notify(`pi-web-codex did not become ready: ${message}`, "error")
      } finally {
        if (child.connected) child.disconnect()
      }
    },
  })
}

function isCliMessage(value: unknown): value is CliMessage {
  if (!value || typeof value !== "object") return false
  if (!("type" in value) || typeof value.type !== "string") return false
  if (value.type === "ready") {
    return "url" in value && typeof value.url === "string"
  }
  return (
    value.type === "error" &&
    "message" in value &&
    typeof value.message === "string"
  )
}

export function waitForReady(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      finish(() =>
        reject(new Error("Timed out waiting for the local web host."))
      )
    }, 15_000)
    timeout.unref()

    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.off("message", onMessage)
      child.off("error", onError)
      child.off("exit", onExit)
      callback()
    }
    const onMessage = (value: unknown) => {
      if (!isCliMessage(value)) return
      if (value.type === "ready") {
        finish(() => resolve(value.url))
      } else {
        finish(() => reject(new Error(value.message)))
      }
    }
    const onError = (error: Error) => {
      finish(() => reject(error))
    }
    const onExit = (code: number | null, signal: string | null) => {
      finish(() =>
        reject(
          new Error(
            `CLI exited before readiness (${signal ?? code ?? "unknown"}).`
          )
        )
      )
    }

    child.on("message", onMessage)
    child.once("error", onError)
    child.once("exit", onExit)
  })
}

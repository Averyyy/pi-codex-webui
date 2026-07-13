import "server-only"

import { homedir } from "node:os"
import path from "node:path"

function configRoot() {
  if (process.env.PI_WEB_CODEX_CONFIG_DIR) {
    return path.resolve(process.env.PI_WEB_CODEX_CONFIG_DIR)
  }

  if (process.platform === "darwin") {
    return path.join(
      homedir(),
      "Library",
      "Application Support",
      "pi-web-codex"
    )
  }

  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      "pi-web-codex"
    )
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"),
    "pi-web-codex"
  )
}

export function getAppPaths() {
  const root = configRoot()
  return {
    root,
    config: path.join(root, "config.json"),
    database: path.join(root, "state.db"),
    sessionLocks: path.join(root, "locks", "sessions"),
    temporary: path.join(root, "tmp"),
  }
}

export function getPiAgentDir() {
  return process.env.PI_CODING_AGENT_DIR
    ? path.resolve(process.env.PI_CODING_AGENT_DIR)
    : path.join(homedir(), ".pi", "agent")
}

export function getPiSessionsRoot() {
  if (process.env.PI_CODING_AGENT_SESSION_DIR) {
    return path.resolve(process.env.PI_CODING_AGENT_SESSION_DIR)
  }
  return path.join(getPiAgentDir(), "sessions")
}

export function getPiWorkerPath() {
  if (process.env.PI_WEB_CODEX_PI_WORKER_PATH) {
    return path.resolve(process.env.PI_WEB_CODEX_PI_WORKER_PATH)
  }
  return path.resolve(process.cwd(), "../../packages/worker-pi/dist/worker.mjs")
}

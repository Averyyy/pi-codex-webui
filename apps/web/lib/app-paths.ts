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
    secrets: path.join(root, "secrets"),
    sessionLocks: path.join(root, "locks", "sessions"),
    temporary: path.join(root, "tmp"),
    taskWorkspace: path.join(root, "tasks"),
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

export function getBuiltinWebUiExtensionsRoot() {
  if (process.env.PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT) {
    return path.resolve(process.env.PI_WEB_CODEX_BUILTIN_EXTENSION_ROOT)
  }
  return path.resolve(process.cwd(), "../../webui-extensions/builtin")
}

export function getExternalWebUiExtensionsRoot() {
  return path.join(getAppPaths().root, "webui-extensions", "node_modules")
}

export function getProjectWebUiExtensionsRoot(cwd: string) {
  return path.join(cwd, ".pi", "webui-extensions")
}

export function getDevelopmentWebUiExtensionPaths() {
  return (process.env.PI_WEB_CODEX_WEBUI_EXTENSION_PATHS ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((entry) => path.resolve(entry))
}

export function getPiWorkerPath() {
  if (process.env.PI_WEB_CODEX_PI_WORKER_PATH) {
    return path.resolve(process.env.PI_WEB_CODEX_PI_WORKER_PATH)
  }
  return path.resolve(process.cwd(), "../../packages/worker-pi/dist/worker.mjs")
}

export function getPiClientWorkerPath() {
  if (process.env.PI_WEB_CODEX_PI_CLIENT_WORKER_PATH) {
    return path.resolve(process.env.PI_WEB_CODEX_PI_CLIENT_WORKER_PATH)
  }
  return path.resolve(
    process.cwd(),
    "../../packages/worker-pi-client/dist/worker.mjs"
  )
}

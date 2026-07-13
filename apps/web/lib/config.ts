import "server-only"

import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rename, rm } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import {
  configSchema,
  DEFAULT_CONFIG,
  mergeConfig,
  type AppConfig,
  type ConfigPatch,
} from "@/lib/config-schema"

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

function configPaths() {
  const root = configRoot()
  return {
    root,
    config: path.join(root, "config.json"),
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const { config } = configPaths()

  try {
    return configSchema.parse(JSON.parse(await readFile(config, "utf8")))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return structuredClone(DEFAULT_CONFIG)
    }
    throw error
  }
}

async function persistConfig(config: AppConfig) {
  const paths = configPaths()
  await mkdir(paths.root, { recursive: true, mode: 0o700 })

  const temporaryPath = `${paths.config}.${randomUUID()}.tmp`
  const file = await open(temporaryPath, "wx", 0o600)
  try {
    await file.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8")
    await file.sync()
  } finally {
    await file.close()
  }

  try {
    await rename(temporaryPath, paths.config)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }

  if (process.platform !== "win32") {
    const directory = await open(paths.root, "r")
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  }
}

export class ConfigConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Configuration revision ${currentRevision} is newer.`)
  }
}

let writeQueue: Promise<void> = Promise.resolve()

export function patchConfig(expectedRevision: number, patch: ConfigPatch) {
  const operation = writeQueue.then(async () => {
    const current = await loadConfig()
    if (current.revision !== expectedRevision) {
      throw new ConfigConflictError(current.revision)
    }

    const next = {
      ...mergeConfig(current, patch),
      revision: current.revision + 1,
    }
    await persistConfig(next)
    return next
  })

  writeQueue = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

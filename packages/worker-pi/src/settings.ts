import { randomUUID } from "node:crypto"
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

import {
  CONFIG_DIR_NAME,
  SettingsManager,
} from "@earendil-works/pi-coding-agent"
import lockfile from "proper-lockfile"

type SettingsScope = "global" | "project"

class AtomicSettingsStorage {
  private readonly paths: Record<SettingsScope, string>

  constructor(cwd: string, agentDir: string) {
    this.paths = {
      global: path.join(path.resolve(agentDir), "settings.json"),
      project: path.join(path.resolve(cwd), CONFIG_DIR_NAME, "settings.json"),
    }
  }

  withLock(
    scope: SettingsScope,
    update: (current: string | undefined) => string | undefined
  ) {
    const settingsPath = this.paths[scope]
    const directory = path.dirname(settingsPath)
    mkdirSync(directory, { recursive: true })
    const release = lockfile.lockSync(settingsPath, { realpath: false })
    try {
      const current = existsSync(settingsPath)
        ? readFileSync(settingsPath, "utf8")
        : undefined
      const next = update(current)
      if (next === undefined) return

      const temporaryPath = path.join(
        directory,
        `.${path.basename(settingsPath)}.${randomUUID()}.tmp`
      )
      let handle: number | undefined
      try {
        handle = openSync(temporaryPath, "wx", 0o600)
        writeFileSync(handle, next, "utf8")
        fsyncSync(handle)
        closeSync(handle)
        handle = undefined
        renameSync(temporaryPath, settingsPath)
      } catch (error) {
        if (handle !== undefined) closeSync(handle)
        rmSync(temporaryPath, { force: true })
        throw error
      }

      if (process.platform !== "win32") {
        const directoryHandle = openSync(directory, "r")
        try {
          fsyncSync(directoryHandle)
        } finally {
          closeSync(directoryHandle)
        }
      }
    } finally {
      release()
    }
  }
}

export function createSettingsManager(
  cwd: string,
  agentDir: string,
  projectTrusted: boolean
) {
  return SettingsManager.fromStorage(new AtomicSettingsStorage(cwd, agentDir), {
    projectTrusted,
  })
}

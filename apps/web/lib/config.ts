import "server-only"

import { randomUUID } from "node:crypto"
import { mkdir, open, readFile, rename, rm } from "node:fs/promises"
import process from "node:process"

import {
  DEFAULT_CONFIG,
  mergeConfig,
  parseConfig,
  type AppConfig,
  type ConfigPatch,
} from "./config-schema"
import { getAppPaths } from "./app-paths"

const INSTANCE_PORT_ENV = "PI_WEB_CODEX_INSTANCE_PORT"

export class InstancePortConfigurationError extends Error {
  constructor(rawPort: string) {
    super(
      `${INSTANCE_PORT_ENV} must be a decimal integer between 1 and 65535; received ${JSON.stringify(rawPort)}.`
    )
    this.name = "InstancePortConfigurationError"
  }
}

export class ManagedInstancePortError extends Error {
  constructor(
    readonly managedPort: number,
    readonly requestedPort: number
  ) {
    super(
      `The server port is managed by the CLI for this instance (${managedPort}); requested port ${requestedPort} is not allowed.`
    )
    this.name = "ManagedInstancePortError"
  }
}

/**
 * Return the CLI-owned port for a managed instance.
 *
 * An absent variable is the existing unmanaged development mode. A present
 * but malformed value is an invalid process contract and must not silently
 * fall back to the default port.
 */
export function getManagedInstancePort(): number | undefined {
  const rawPort = process.env[INSTANCE_PORT_ENV]
  if (rawPort === undefined) return undefined

  if (!/^\d+$/.test(rawPort)) {
    throw new InstancePortConfigurationError(rawPort)
  }

  const port = Number(rawPort)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new InstancePortConfigurationError(rawPort)
  }
  return port
}

function applyManagedInstancePort(config: AppConfig) {
  const managedPort = getManagedInstancePort()
  if (managedPort === undefined || config.server.port === managedPort) {
    return config
  }

  return {
    ...config,
    server: {
      ...config.server,
      port: managedPort,
    },
  }
}

export async function loadConfig(): Promise<AppConfig> {
  const { config } = getAppPaths()

  try {
    return applyManagedInstancePort(
      parseConfig(JSON.parse(await readFile(config, "utf8")))
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return applyManagedInstancePort(structuredClone(DEFAULT_CONFIG))
    }
    throw error
  }
}

async function persistConfig(config: AppConfig) {
  const paths = getAppPaths()
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
    const managedPort = getManagedInstancePort()
    if (
      managedPort !== undefined &&
      patch.server?.port !== undefined &&
      patch.server.port !== managedPort
    ) {
      throw new ManagedInstancePortError(managedPort, patch.server.port)
    }

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

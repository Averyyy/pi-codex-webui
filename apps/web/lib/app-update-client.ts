export const APP_UPDATE_STATUS_PATH = "/api/v1/update"
export const APP_HEALTH_PATH = "/api/v1/health"

export const APP_UPDATE_STATUS_TTL_MS = 30 * 60 * 1000
export const APP_UPDATE_OPERATION_TIMEOUT_MS = 30 * 60 * 1000
export const APP_UPDATE_REQUEST_TIMEOUT_MS = 15_000
export const APP_UPDATE_PENDING_STORAGE_KEY = "pi-web-codex:update-operation.v1"
export const APP_UPDATE_BROADCAST_STORAGE_KEY =
  "pi-web-codex:update-broadcast.v1"
export const APP_UPDATE_BROADCAST_CHANNEL = "pi-web-codex:update"

export type AppUpdatePhase =
  "idle" | "checking" | "installing" | "restarting" | "succeeded" | "failed"

export interface AppUpdateSnapshot {
  supported: boolean
  currentVersion: string
  latestVersion: string | null
  available: boolean
  phase: AppUpdatePhase
  error: string | null
  operationId: string | null
}

export interface AppUpdateOperation {
  operationId: string | null
  targetVersion: string
  startedAt: number
}

export interface AppHealthSnapshot {
  status?: string
  name?: string
  version?: string
  [key: string]: unknown
}

export type UpdateFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export class AppUpdateError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly transient = false
  ) {
    super(message)
    this.name = "AppUpdateError"
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

export function isAppUpdatePhase(value: unknown): value is AppUpdatePhase {
  return (
    value === "idle" ||
    value === "checking" ||
    value === "installing" ||
    value === "restarting" ||
    value === "succeeded" ||
    value === "failed"
  )
}

export function isAppUpdateSnapshot(
  value: unknown
): value is AppUpdateSnapshot {
  if (!isRecord(value)) return false
  return (
    typeof value.supported === "boolean" &&
    typeof value.currentVersion === "string" &&
    nullableString(value.latestVersion) &&
    typeof value.available === "boolean" &&
    isAppUpdatePhase(value.phase) &&
    nullableString(value.error) &&
    nullableString(value.operationId)
  )
}

function parseJson(text: string, status: number): unknown {
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AppUpdateError(
      `Update service returned invalid JSON (HTTP ${status}).`,
      status,
      undefined,
      status >= 500
    )
  }
}

function responseError(value: unknown, status: number) {
  const error =
    isRecord(value) && typeof value.error === "string"
      ? value.error
      : `Update request failed (HTTP ${status}).`
  const code =
    isRecord(value) && typeof value.code === "string" ? value.code : undefined
  return new AppUpdateError(error, status, code, status >= 500)
}

async function readResponse(response: Response): Promise<unknown> {
  const value = parseJson(await response.text(), response.status)
  if (!response.ok) throw responseError(value, response.status)
  if (value === null) {
    throw new AppUpdateError(
      "Update service returned an empty response.",
      response.status
    )
  }
  return value
}

function requestWithTimeout(
  fetcher: UpdateFetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs = APP_UPDATE_REQUEST_TIMEOUT_MS
) {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs)
  const signal = init?.signal
  const combinedSignal = signal
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal
  const combinedInit: RequestInit = { ...init, signal: combinedSignal }
  const request = fetcher(input, combinedInit).catch((failure: unknown) => {
    if (failure instanceof DOMException && failure.name === "AbortError") {
      throw new AppUpdateError(
        "Update service request timed out.",
        undefined,
        undefined,
        true
      )
    }
    if (failure instanceof TypeError) {
      throw new AppUpdateError(
        "Could not reach the update service.",
        undefined,
        undefined,
        true
      )
    }
    throw failure
  })
  return request.finally(() => {
    globalThis.clearTimeout(timer)
  })
}

export async function fetchAppUpdateStatus(
  fetcher: UpdateFetch = fetch,
  signal?: AbortSignal
): Promise<AppUpdateSnapshot> {
  const value = await readResponse(
    await requestWithTimeout(fetcher, APP_UPDATE_STATUS_PATH, {
      method: "GET",
      cache: "no-store",
      signal,
    })
  )
  if (!isAppUpdateSnapshot(value)) {
    throw new AppUpdateError(
      "Update service returned an invalid status snapshot."
    )
  }
  return value
}

export async function requestAppUpdate(
  version: string,
  mutationToken: string,
  fetcher: UpdateFetch = fetch,
  signal?: AbortSignal
): Promise<AppUpdateSnapshot> {
  if (!version) throw new AppUpdateError("An update version is required.")
  const value = await readResponse(
    await requestWithTimeout(fetcher, APP_UPDATE_STATUS_PATH, {
      method: "POST",
      cache: "no-store",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Pi-Web-Codex-Mutation-Token": mutationToken,
      },
      body: JSON.stringify({ version }),
    })
  )
  if (!isAppUpdateSnapshot(value)) {
    throw new AppUpdateError(
      "Update service returned an invalid update snapshot."
    )
  }
  return value
}

export async function fetchHealthVersion(
  fetcher: UpdateFetch = fetch,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const value = await readResponse(
      await requestWithTimeout(fetcher, APP_HEALTH_PATH, {
        method: "GET",
        cache: "no-store",
        signal,
      })
    )
    if (
      !isRecord(value) ||
      value.status !== "ok" ||
      value.name !== "pi-web-codex" ||
      typeof value.version !== "string"
    ) {
      return null
    }
    return value.version
  } catch (failure) {
    if (failure instanceof AppUpdateError && failure.transient) return null
    throw failure
  }
}

export function isUpdateReadyForReload(
  snapshot: AppUpdateSnapshot,
  targetVersion: string,
  healthVersion: string | null
) {
  return (
    snapshot.phase === "succeeded" &&
    snapshot.currentVersion === targetVersion &&
    healthVersion === targetVersion
  )
}

/**
 * A fresh tab can resume only an update that is still installing or
 * restarting. A persisted succeeded snapshot belongs to the bundle that has
 * already been verified and must not trigger an endless reload loop.
 */
export function canRecoverAppUpdate(
  snapshot: AppUpdateSnapshot
): snapshot is AppUpdateSnapshot & {
  latestVersion: string
  operationId: string
} {
  return (
    (snapshot.phase === "installing" || snapshot.phase === "restarting") &&
    snapshot.operationId !== null &&
    snapshot.latestVersion !== null
  )
}

export function updatePollDelay(attempt: number) {
  if (!Number.isFinite(attempt) || attempt <= 0) return 1_000
  return Math.min(2_000, 1_000 + Math.floor(attempt) * 500)
}

export function createPendingAppUpdate(
  targetVersion: string,
  operationId: string | null = null,
  startedAt = Date.now()
): AppUpdateOperation {
  if (!targetVersion) throw new AppUpdateError("An update version is required.")
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    throw new AppUpdateError("An update start time is required.")
  }
  return { operationId, targetVersion, startedAt }
}

export function serializePendingAppUpdate(
  operation: AppUpdateOperation
): string {
  return JSON.stringify(operation)
}

export function parsePendingAppUpdate(
  value: unknown
): AppUpdateOperation | null {
  if (!isRecord(value)) return null
  if (
    !(value.operationId === null || typeof value.operationId === "string") ||
    typeof value.targetVersion !== "string" ||
    !value.targetVersion ||
    typeof value.startedAt !== "number" ||
    !Number.isFinite(value.startedAt) ||
    value.startedAt <= 0
  ) {
    return null
  }
  return {
    operationId: value.operationId,
    targetVersion: value.targetVersion,
    startedAt: value.startedAt,
  }
}

export function parsePendingAppUpdateJson(value: string | null) {
  if (!value) return null
  try {
    return parsePendingAppUpdate(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}

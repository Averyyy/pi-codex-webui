import "server-only"

import { z } from "zod"

import { APP_VERSION } from "./app"

const CONTROL_URL_ENV = "PI_WEB_CODEX_UPDATE_CONTROL_URL"
const CONTROL_TOKEN_ENV = "PI_WEB_CODEX_UPDATE_CONTROL_TOKEN"
const CONTROL_TIMEOUT_MS = 15_000

const updatePhaseSchema = z.enum([
  "idle",
  "checking",
  "installing",
  "restarting",
  "succeeded",
  "failed",
])

export const appUpdateStatusSchema = z
  .object({
    supported: z.boolean(),
    currentVersion: z.string(),
    latestVersion: z.string().nullable(),
    available: z.boolean(),
    phase: updatePhaseSchema,
    error: z.string().nullable(),
    operationId: z.string().nullable(),
  })
  .strict()

export type AppUpdateStatus = z.infer<typeof appUpdateStatusSchema>

type ControlConfig = {
  baseUrl: string
  token: string
}

type UnsupportedReason = {
  message: string
  code: string
  configured: boolean
}

type UpdateProxyResult = {
  status: number
  body: Record<string, unknown>
}

export class AppUpdateProxyError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 503
  ) {
    super(message)
    this.name = "AppUpdateProxyError"
  }
}

function unsupportedStatus(reason: UnsupportedReason): AppUpdateStatus {
  return {
    supported: false,
    currentVersion: APP_VERSION,
    latestVersion: null,
    available: false,
    phase: "idle",
    error: reason.message,
    operationId: null,
  }
}

function controlConfig():
  | { config: ControlConfig; reason: null }
  | { config: null; reason: UnsupportedReason } {
  const rawUrl = process.env[CONTROL_URL_ENV]?.trim()
  const token = process.env[CONTROL_TOKEN_ENV]
  if (!rawUrl && !token) {
    return {
      config: null,
      reason: {
        code: "UpdateUnsupported",
        message:
          "Application updates are unavailable because the packaged update supervisor is not configured.",
        configured: false,
      },
    }
  }
  if (!rawUrl || !token) {
    return {
      config: null,
      reason: {
        code: "UpdateControlInvalid",
        message:
          "Application updates are unavailable because the update supervisor configuration is incomplete.",
        configured: true,
      },
    }
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return {
      config: null,
      reason: {
        code: "UpdateControlInvalid",
        message:
          "Application updates are unavailable because the update control URL is invalid.",
        configured: true,
      },
    }
  }

  const port = Number(parsed.port)
  const loopback =
    parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"
  if (
    parsed.protocol !== "http:" ||
    !loopback ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    return {
      config: null,
      reason: {
        code: "UpdateControlInvalid",
        message:
          "Application updates are unavailable because the update control endpoint is not a loopback HTTP endpoint.",
        configured: true,
      },
    }
  }

  return { config: { baseUrl: parsed.origin, token }, reason: null }
}

function timeoutSignal() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CONTROL_TIMEOUT_MS)
  timeout.unref?.()
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  }
}

async function readJson(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function genericControlError(status: number) {
  return {
    error: `The update supervisor returned HTTP ${status}.`,
    code: "UpdateControlFailed",
  }
}

async function fetchControl(path: string, init: RequestInit = {}) {
  const control = controlConfig()
  if (!control.config) return { control, response: null, clear: () => {} }

  const timer = timeoutSignal()
  try {
    const response = await fetch(`${control.config.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      signal: timer.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${control.config.token}`,
        ...(init.headers ?? {}),
      },
    })
    return { control, response, clear: timer.clear }
  } catch (error) {
    timer.clear()
    return {
      control,
      response: null,
      clear: () => {},
      error:
        error instanceof DOMException && error.name === "AbortError"
          ? "The update supervisor did not respond before the request timed out."
          : "The update supervisor could not be reached.",
    }
  }
}

function sanitizedMessage(message: string) {
  const control = controlConfig()
  let result = message.slice(0, 500)
  if (control.config) {
    result = result.replaceAll(control.config.token, "[redacted]")
    result = result.replaceAll(control.config.baseUrl, "the update supervisor")
  }
  return result
}

export async function getAppUpdateStatus(): Promise<AppUpdateStatus> {
  const result = await fetchControl("/status")
  if (!result.control.config) {
    if (result.control.reason.configured) {
      throw new AppUpdateProxyError(
        result.control.reason.code,
        result.control.reason.message
      )
    }
    return unsupportedStatus(result.control.reason)
  }
  if (!result.response) {
    throw new AppUpdateProxyError(
      "UpdateControlUnavailable",
      result.error ?? "The update supervisor could not be reached."
    )
  }

  try {
    const body = await readJson(result.response)
    const parsed = appUpdateStatusSchema.safeParse(body)
    if (!result.response.ok || !parsed.success) {
      throw new AppUpdateProxyError(
        "UpdateControlFailed",
        result.response.ok
          ? "The update supervisor returned an invalid status."
          : `The update supervisor returned HTTP ${result.response.status}.`
      )
    }
    return parsed.data
  } finally {
    result.clear?.()
  }
}

export async function requestAppUpdate(
  version: string
): Promise<UpdateProxyResult> {
  const result = await fetchControl("/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version }),
  })
  if (!result.control.config) {
    return {
      status: result.control.reason.configured ? 503 : 409,
      body: {
        error: sanitizedMessage(result.control.reason.message),
        code: result.control.reason.code,
      },
    }
  }
  if (!result.response) {
    return {
      status: 503,
      body: {
        error: sanitizedMessage(
          result.error ?? "The update supervisor could not be reached."
        ),
        code: "UpdateControlUnavailable",
      },
    }
  }

  try {
    const body = await readJson(result.response)
    if (body && typeof body.error === "string") {
      return {
        status: result.response.status,
        body: {
          error: sanitizedMessage(body.error),
          ...(typeof body.code === "string" ? { code: body.code } : {}),
        },
      }
    }
    if (result.response.ok) {
      return {
        status: result.response.status,
        body: body ?? { ok: true },
      }
    }
    return {
      status: result.response.status,
      body: genericControlError(result.response.status),
    }
  } finally {
    result.clear?.()
  }
}

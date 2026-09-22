import "server-only"

import { randomBytes, timingSafeEqual } from "node:crypto"

import { updateMaintenanceError } from "./update-maintenance"

const MUTATION_TOKEN_ENV = "PI_WEB_CODEX_MUTATION_TOKEN"
const UPDATE_CONTROL_TOKEN_ENV = "PI_WEB_CODEX_UPDATE_CONTROL_TOKEN"
const LOCAL_HOST_PATTERN = /^(?:127\.0\.0\.1|localhost):\d+$/

export function isLoopbackHost(host: string | null) {
  return host !== null && LOCAL_HOST_PATTERN.test(host)
}

export function getMutationToken() {
  const existing = process.env[MUTATION_TOKEN_ENV]
  if (existing) return existing

  const token = randomBytes(32).toString("base64url")
  process.env[MUTATION_TOKEN_ENV] = token
  return token
}

export function validateLocalMutation(request: Request) {
  const host = request.headers.get("host")
  if (!isLoopbackHost(host)) {
    return "Invalid Host header."
  }

  if (request.headers.get("origin") !== `http://${host}`) {
    return "Mutation requests must come from the local application origin."
  }

  const expected = Buffer.from(getMutationToken())
  const received = Buffer.from(
    request.headers.get("x-pi-web-codex-mutation-token") ?? ""
  )
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return "Invalid mutation token."
  }

  return updateMaintenanceError()
}

function constantTimeTokenMatches(
  expectedToken: string,
  receivedToken: string
) {
  const expected = Buffer.from(expectedToken)
  const received = Buffer.from(receivedToken)
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  )
}

/**
 * Authenticate the CLI's loopback-only preparation calls.  These calls use a
 * separate bearer token and intentionally do not require an Origin header.
 */
export function validateUpdateControlRequest(request: Request) {
  if (!isLoopbackHost(request.headers.get("host"))) {
    return "Invalid update control host."
  }

  const expected = process.env[UPDATE_CONTROL_TOKEN_ENV]
  if (!expected) return "Update control is unavailable."

  const authorization = request.headers.get("authorization") ?? ""
  const received = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : ""
  if (!constantTimeTokenMatches(expected, received)) {
    return "Invalid update control token."
  }
  return null
}

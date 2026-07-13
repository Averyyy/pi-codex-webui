import "server-only"

import { randomBytes, timingSafeEqual } from "node:crypto"

const MUTATION_TOKEN_ENV = "PI_WEB_CODEX_MUTATION_TOKEN"
const LOCAL_HOST_PATTERN = /^127\.0\.0\.1:\d+$/

export function getMutationToken() {
  const existing = process.env[MUTATION_TOKEN_ENV]
  if (existing) return existing

  const token = randomBytes(32).toString("base64url")
  process.env[MUTATION_TOKEN_ENV] = token
  return token
}

export function validateLocalMutation(request: Request) {
  const host = request.headers.get("host")
  if (!host || !LOCAL_HOST_PATTERN.test(host)) {
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

  return null
}

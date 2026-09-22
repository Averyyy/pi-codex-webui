import assert from "node:assert/strict"
import test from "node:test"

import {
  getMutationToken,
  validateLocalMutation,
  validateUpdateControlRequest,
} from "./request-security"
import {
  beginUpdatePreparation,
  cancelUpdatePreparation,
} from "./update-maintenance"

const token = getMutationToken()

function mutationRequest(host: string, origin = `http://${host}`) {
  return new Request(`http://${host}/api/v1/settings`, {
    method: "PATCH",
    headers: {
      host,
      origin,
      "x-pi-web-codex-mutation-token": token,
    },
  })
}

test("local mutation validation accepts supported loopback hosts", () => {
  assert.equal(validateLocalMutation(mutationRequest("127.0.0.1:1816")), null)
  assert.equal(validateLocalMutation(mutationRequest("localhost:1816")), null)
})

test("local mutation validation rejects non-loopback hosts", () => {
  assert.equal(
    validateLocalMutation(mutationRequest("example.com:1816")),
    "Invalid Host header."
  )
})

test("local mutation validation still requires the matching origin", () => {
  assert.equal(
    validateLocalMutation(
      mutationRequest("localhost:1816", "http://127.0.0.1:1816")
    ),
    "Mutation requests must come from the local application origin."
  )
})

test("authenticated local mutations are blocked while update preparation is active", () => {
  const operationId = beginUpdatePreparation()
  try {
    assert.equal(
      validateLocalMutation(mutationRequest("localhost:1816")),
      "The WebUI is preparing for an update. Retry after the restart completes."
    )
  } finally {
    cancelUpdatePreparation(operationId)
  }
})

test("update control authentication is loopback bearer-only", () => {
  const previous = process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN
  process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = "control-secret"
  const request = (headers: Record<string, string>) =>
    new Request("http://127.0.0.1:1816/api/v1/update/prepare", {
      method: "POST",
      headers: { host: "127.0.0.1:1816", ...headers },
    })
  try {
    assert.equal(
      validateUpdateControlRequest(
        request({ authorization: "Bearer control-secret" })
      ),
      null
    )
    assert.equal(
      validateUpdateControlRequest(
        request({ authorization: "Bearer wrong-secret" })
      ),
      "Invalid update control token."
    )
    assert.equal(
      validateUpdateControlRequest(
        new Request("http://example.test/api/v1/update/prepare", {
          method: "POST",
          headers: {
            host: "example.test:1816",
            authorization: "Bearer control-secret",
          },
        })
      ),
      "Invalid update control host."
    )
  } finally {
    if (previous === undefined) delete process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN
    else process.env.PI_WEB_CODEX_UPDATE_CONTROL_TOKEN = previous
  }
})

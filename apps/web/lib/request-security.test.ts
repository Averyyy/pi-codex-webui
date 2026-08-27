import assert from "node:assert/strict"
import test from "node:test"

import { getMutationToken, validateLocalMutation } from "./request-security"

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

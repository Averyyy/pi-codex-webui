import assert from "node:assert/strict"
import test from "node:test"
import { POST } from "../app/api/v1/projects/pick/route"
import { getMutationToken } from "./request-security"

function request(body: unknown, authorized = true) {
  return new Request("http://localhost:1817/api/v1/projects/pick", {
    method: "POST",
    headers: {
      host: "localhost:1817",
      origin: "http://localhost:1817",
      "Content-Type": "application/json",
      ...(authorized
        ? { "X-Pi-Web-Codex-Mutation-Token": getMutationToken() }
        : {}),
    },
    body: JSON.stringify(body),
  })
}
test("directory browsing requires the local mutation token", async () => {
  assert.equal((await POST(request({}, false))).status, 403)
})
test("directory browsing returns explicit errors without opening native processes", async () => {
  for (const body of [
    { path: null },
    { path: "" },
    { path: "relative" },
    { path: "bad\0path" },
  ]) {
    const response = await POST(request(body))
    assert.equal(response.status, 400)
    assert.equal(typeof (await response.json()).error, "string")
  }
})

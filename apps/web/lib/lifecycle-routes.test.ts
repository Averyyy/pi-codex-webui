import assert from "node:assert/strict"
import test from "node:test"

import { POST as createProject } from "../app/api/v1/projects/route"
import { PATCH as updateProject } from "../app/api/v1/projects/[projectId]/route"
import { POST as createWorktree } from "../app/api/v1/projects/[projectId]/worktrees/route"
import { POST as pinSession } from "../app/api/v1/sessions/[sessionId]/pin/route"
import { getMutationToken } from "./request-security"

const host = "127.0.0.1:1816"
const token = getMutationToken()

function invalidJsonRequest(path: string, method: string) {
  return new Request(`http://${host}${path}`, {
    method,
    headers: {
      host,
      origin: `http://${host}`,
      "content-type": "application/json",
      "x-pi-web-codex-mutation-token": token,
    },
    body: "{invalid json}",
  })
}

test("project and pin lifecycle routes return structured invalid JSON errors", async () => {
  const responses = await Promise.all([
    createProject(invalidJsonRequest("/api/v1/projects", "POST")),
    updateProject(invalidJsonRequest("/api/v1/projects/project-a", "PATCH"), {
      params: Promise.resolve({ projectId: "project-a" }),
    }),
    createWorktree(
      invalidJsonRequest("/api/v1/projects/project-a/worktrees", "POST"),
      { params: Promise.resolve({ projectId: "project-a" }) }
    ),
    pinSession(invalidJsonRequest("/api/v1/sessions/session-a/pin", "POST"), {
      params: Promise.resolve({ sessionId: "session-a" }),
    }),
  ])

  for (const response of responses) {
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      error: "Invalid JSON body.",
      code: "InvalidJson",
    })
  }
})

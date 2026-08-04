import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { POST as createProject } from "../app/api/v1/projects/route"
import { GET as projectChanges } from "../app/api/v1/projects/[projectId]/changes/route"
import { PATCH as updateProject } from "../app/api/v1/projects/[projectId]/route"
import { POST as createWorktree } from "../app/api/v1/projects/[projectId]/worktrees/route"
import { POST as importSession } from "../app/api/v1/sessions/[sessionId]/import/route"
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

function jsonRequest(requestPath: string, body: unknown) {
  return new Request(`http://${host}${requestPath}`, {
    method: "POST",
    headers: {
      host,
      origin: `http://${host}`,
      "content-type": "application/json",
      "x-pi-web-codex-mutation-token": token,
    },
    body: JSON.stringify(body),
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

test("session import returns a structured malformed multipart error", async () => {
  const response = await importSession(
    new Request(`http://${host}/api/v1/sessions/session-a/import`, {
      method: "POST",
      headers: {
        host,
        origin: `http://${host}`,
        "content-type": "text/plain",
        "x-pi-web-codex-mutation-token": token,
      },
      body: "not multipart form data",
    }),
    { params: Promise.resolve({ sessionId: "session-a" }) }
  )

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), {
    error: "Invalid multipart form data.",
    code: "InvalidFormData",
  })
})

test("project lifecycle routes reject invalid filesystem and Git paths", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-web-project-route-"))
  const file = path.join(directory, "not-a-directory")
  await writeFile(file, "fixture")
  try {
    const fileResponse = await createProject(
      jsonRequest("/api/v1/projects", { path: file })
    )
    assert.equal(fileResponse.status, 400)
    assert.deepEqual(await fileResponse.json(), {
      error: "Project path must be a directory.",
    })

    const nulProjectResponse = await createProject(
      jsonRequest("/api/v1/projects", { path: "invalid\0path" })
    )
    assert.equal(nulProjectResponse.status, 400)
    assert.deepEqual(await nulProjectResponse.json(), {
      error: "Invalid project path.",
    })

    const nulWorktreeResponse = await createWorktree(
      jsonRequest("/api/v1/projects/project-a/worktrees", {
        path: "/tmp/worktree",
        branch: "invalid\0branch",
      }),
      { params: Promise.resolve({ projectId: "project-a" }) }
    )
    assert.equal(nulWorktreeResponse.status, 400)
    assert.deepEqual(await nulWorktreeResponse.json(), {
      error: "Invalid worktree path or branch.",
    })

    const relativeWorktreeResponse = await createWorktree(
      jsonRequest("/api/v1/projects/project-a/worktrees", {
        path: "relative-worktree",
        branch: "fixture-branch",
      }),
      { params: Promise.resolve({ projectId: "project-a" }) }
    )
    assert.equal(relativeWorktreeResponse.status, 400)
    assert.deepEqual(await relativeWorktreeResponse.json(), {
      error: "Invalid worktree path or branch.",
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("project change stream returns a structured missing-project error", async () => {
  const response = await projectChanges(
    new Request(`http://${host}/api/v1/projects/missing-project/changes`),
    { params: Promise.resolve({ projectId: "missing-project" }) }
  )

  assert.equal(response.status, 404)
  assert.deepEqual(await response.json(), {
    error: "Project not found.",
    code: "ProjectNotFound",
  })
})

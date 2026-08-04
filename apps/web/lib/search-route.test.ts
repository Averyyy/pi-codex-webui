import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { GET } from "@/app/api/v1/search/route"
import { getDatabase } from "@/lib/database"

test("search API reports the same canonical query that it executes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-search-route-"))
  const previous = {
    config: process.env.PI_WEB_CODEX_CONFIG_DIR,
    sessions: process.env.PI_CODING_AGENT_SESSION_DIR,
  }
  process.env.PI_WEB_CODEX_CONFIG_DIR = path.join(root, "config")
  process.env.PI_CODING_AGENT_SESSION_DIR = path.join(root, "sessions")
  await mkdir(process.env.PI_CODING_AGENT_SESSION_DIR, { recursive: true })
  globalThis.piWebCodexDatabase = undefined
  globalThis.piWebCodexIndexSync = undefined

  try {
    const response = await GET(
      new Request(
        "http://127.0.0.1:1816/api/v1/search?q=compact%00maxsim%20%20rerank"
      )
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.deepEqual(await response.json(), {
      query: "compact maxsim rerank",
      results: [],
    })
  } finally {
    const database = await getDatabase()
    database.close()
    globalThis.piWebCodexDatabase = undefined
    globalThis.piWebCodexIndexSync = undefined
    await rm(root, { recursive: true, force: true })
    if (previous.config === undefined)
      delete process.env.PI_WEB_CODEX_CONFIG_DIR
    else process.env.PI_WEB_CODEX_CONFIG_DIR = previous.config
    if (previous.sessions === undefined)
      delete process.env.PI_CODING_AGENT_SESSION_DIR
    else process.env.PI_CODING_AGENT_SESSION_DIR = previous.sessions
  }
})

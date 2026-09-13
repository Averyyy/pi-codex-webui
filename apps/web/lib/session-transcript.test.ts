import assert from "node:assert/strict"
import fs from "node:fs/promises"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import test, { mock } from "node:test"

import { getSessionIdentityByNativeFile } from "./catalog"
import { getDatabase } from "./database"
import {
  getSessionTranscriptPage,
  TRANSCRIPT_PAGE_BYTES,
  TRANSCRIPT_PAGE_ENTRIES,
} from "./session-transcript"

test("compact history reads only selected byte ranges and defers oversized records", async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), "pi-compact-pages-"))
  const previous = [
    process.env.PI_WEB_CODEX_CONFIG_DIR,
    process.env.PI_CODING_AGENT_SESSION_DIR,
  ]
  process.env.PI_WEB_CODEX_CONFIG_DIR = path.join(root, "config")
  process.env.PI_CODING_AGENT_SESSION_DIR = path.join(root, "sessions")
  globalThis.piWebCodexDatabase = undefined
  await fs.mkdir(process.env.PI_CODING_AGENT_SESSION_DIR, { recursive: true })
  const file = path.join(process.env.PI_CODING_AGENT_SESSION_DIR, "long.jsonl")
  const timestamp = "2026-09-12T00:00:00.000Z"
  const lines: object[] = [
    { type: "session", id: "native-long", version: 3, cwd: root, timestamp },
  ]
  let parentId: string | null = null
  const message = (id: string, text: string) => {
    lines.push({
      type: "message",
      id,
      parentId,
      timestamp,
      message: {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.parse(timestamp),
      },
    })
    parentId = id
  }
  const compact = (id: string) => {
    lines.push({
      type: "compaction",
      id,
      parentId,
      timestamp,
      summary: `Summary ${id}`,
      firstKeptEntryId: parentId,
      tokensBefore: 100_000,
    })
    parentId = id
  }
  message("oversized", "x".repeat(2 * 1024 * 1024))
  compact("compact-one")
  for (let index = 0; index < 130; index++)
    message(`middle-${index}`, `middle ${index}`)
  compact("compact-two")
  message("latest-one", "latest one")
  message("latest-two", "latest two")
  await fs.writeFile(
    file,
    lines.map((line) => JSON.stringify(line)).join("\r\n") + "\r\n"
  )
  try {
    const identity = await getSessionIdentityByNativeFile(file)
    assert.ok(identity)
    const originalOpen = fs.open
    let readBytes = 0
    const wrapped = mock.method(
      fs,
      "open",
      async (...args: Parameters<typeof fs.open>) => {
        const handle = await originalOpen(...args)
        if (String(args[0]) !== file) return handle
        return new Proxy(handle, {
          get(target, key) {
            if (key === "read")
              return async (...readArgs: unknown[]) => {
                const result = await (
                  target.read as (
                    ...args: unknown[]
                  ) => Promise<{ bytesRead: number }>
                )(...readArgs)
                readBytes += result.bytesRead
                return result
              }
            const value = Reflect.get(target, key, target)
            return typeof value === "function" ? value.bind(target) : value
          },
        })
      }
    )
    syncBuiltinESMExports()
    try {
      const first = await getSessionTranscriptPage(identity.id)
      assert.deepEqual(
        first?.entries.map((entry) => entry.id),
        ["compact-two", "latest-one", "latest-two"]
      )
      assert.ok(readBytes < 4000)
      assert.ok(Buffer.byteLength(JSON.stringify(first)) < 20_000)
      assert.equal(first?.session.firstMessage.length, 512)
      assert.equal(first?.history?.boundary, "compaction")
      const all = [...first!.entries]
      let cursor = first!.history!.nextCursor
      while (cursor) {
        const before = readBytes
        const page = await getSessionTranscriptPage(identity.id, { cursor })
        assert.ok(page!.history!.entryIds.length <= TRANSCRIPT_PAGE_ENTRIES)
        assert.ok(readBytes - before <= TRANSCRIPT_PAGE_BYTES)
        all.unshift(...page!.entries)
        cursor = page!.history!.nextCursor ?? null
      }
      assert.equal(all.length, 135)
      assert.equal(new Set(all.map((entry) => entry.id)).size, 135)
      const large = all[0]
      assert.equal(large?.kind, "event")
      assert.equal(
        large?.kind === "event" &&
          large.deferred !== undefined &&
          large.deferred.byteLength > 2 * 1024 * 1024,
        true
      )
      assert.ok(readBytes < 100_000)
      const loaded = await getSessionTranscriptPage(identity.id, {
        entryId: "oversized",
      })
      assert.equal(loaded?.entries[0]?.kind, "message")
      assert.ok(readBytes > 2 * 1024 * 1024)
      await assert.rejects(
        getSessionTranscriptPage(identity.id, { cursor: "bad-cursor" })
      )
      await assert.rejects(
        getSessionTranscriptPage(identity.id, { entryId: "missing" }),
        /outside/
      )
    } finally {
      wrapped.mock.restore()
      syncBuiltinESMExports()
    }
  } finally {
    const database = await getDatabase()
    database.close()
    globalThis.piWebCodexDatabase = undefined
    if (previous[0] === undefined) delete process.env.PI_WEB_CODEX_CONFIG_DIR
    else process.env.PI_WEB_CODEX_CONFIG_DIR = previous[0]
    if (previous[1] === undefined)
      delete process.env.PI_CODING_AGENT_SESSION_DIR
    else process.env.PI_CODING_AGENT_SESSION_DIR = previous[1]
    await fs.rm(root, { recursive: true, force: true })
  }
})

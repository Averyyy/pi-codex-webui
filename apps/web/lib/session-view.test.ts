import assert from "node:assert/strict"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import type { RuntimeStatus } from "@workspace/runtime-protocol"

import { getSessionIdentityByNativeFile } from "./catalog"
import { getDatabase } from "./database"
import { EventHub } from "./event-hub"
import { RuntimeLiveState } from "./runtime-live"
import { RuntimeSupervisor } from "./runtime-supervisor"
import { syncPiSessionFile } from "./session-index"
import { getSessionView } from "./session-view"

const timestamp = "2026-09-30T00:00:00.000Z"

function message(id: string, parentId: string | null, text: string) {
  return {
    type: "message",
    id,
    parentId,
    timestamp,
    message: {
      role: "user",
      content: [{ type: "text", text }],
      timestamp: Date.parse(timestamp),
    },
  }
}

async function withSessionFixture(
  run: (fixture: {
    file: string
    sessionId: string
    supervisor: RuntimeSupervisor
    write(entries: object[]): Promise<void>
    append(entries: object[]): Promise<void>
    setLive(value: RuntimeLiveState | null, status: RuntimeStatus): void
  }) => Promise<void>
) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "pi-session-view-"))
  const previous = {
    config: process.env.PI_WEB_CODEX_CONFIG_DIR,
    sessions: process.env.PI_CODING_AGENT_SESSION_DIR,
    database: globalThis.piWebCodexDatabase,
    supervisor: globalThis.piWebCodexRuntimeSupervisor,
  }
  process.env.PI_WEB_CODEX_CONFIG_DIR = path.join(root, "config")
  process.env.PI_CODING_AGENT_SESSION_DIR = path.join(root, "sessions")
  globalThis.piWebCodexDatabase = undefined
  await fs.mkdir(process.env.PI_CODING_AGENT_SESSION_DIR, { recursive: true })
  const file = path.join(process.env.PI_CODING_AGENT_SESSION_DIR, "view.jsonl")
  const header = {
    type: "session",
    id: "native-view",
    version: 3,
    cwd: root,
    timestamp,
  }
  const serialize = (entries: object[]) =>
    entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
  await fs.writeFile(file, serialize([header]))
  const supervisor = new RuntimeSupervisor(new EventHub())
  let live: RuntimeLiveState | null = null
  let status: RuntimeStatus = "stopped"
  supervisor.liveState = () =>
    live ? { ...live.capture(status), instance: live as object } : null
  supervisor.state = () => ({ status, snapshot: null })
  globalThis.piWebCodexRuntimeSupervisor = supervisor
  try {
    const identity = await getSessionIdentityByNativeFile(file)
    assert.ok(identity)
    await run({
      file,
      sessionId: identity.id,
      supervisor,
      write: (entries) => fs.writeFile(file, serialize([header, ...entries])),
      append: (entries) => fs.appendFile(file, serialize(entries)),
      setLive(value, nextStatus) {
        live = value
        status = nextStatus
      },
    })
  } finally {
    const database = await getDatabase()
    database.close()
    globalThis.piWebCodexDatabase = previous.database
    globalThis.piWebCodexRuntimeSupervisor = previous.supervisor
    if (previous.config === undefined)
      delete process.env.PI_WEB_CODEX_CONFIG_DIR
    else process.env.PI_WEB_CODEX_CONFIG_DIR = previous.config
    if (previous.sessions === undefined)
      delete process.env.PI_CODING_AGENT_SESSION_DIR
    else process.env.PI_CODING_AGENT_SESSION_DIR = previous.sessions
    await fs.rm(root, { recursive: true, force: true })
  }
}

test("selected file sync keeps a first turn's disk entries behind its live boundary", async () => {
  await withSessionFixture(async ({ sessionId, append, setLive }) => {
    const live = new RuntimeLiveState(null)
    live.store.restore({
      messages: [
        {
          id: 0,
          role: "user",
          parts: [{ type: "text", text: "first turn" }],
          complete: false,
        },
      ],
      tools: [],
      activeMessageIds: [["user", 0]],
      nextMessageId: 1,
      runtimeStatus: "busy",
    })
    setLive(live, "busy")
    await append([message("first", null, "first turn")])

    const during = await getSessionView(sessionId, null, true)
    assert.ok(during)
    assert.equal(during.snapshot.history?.leafId, null)
    assert.deepEqual(during.snapshot.entries, [])
    assert.equal(during.live.messages.length, 1)
    assert.equal("instance" in during.live, false)

    assert.equal(live.checkpoint(live.revision, "first"), true)
    setLive(live, "ready")
    const completed = await getSessionView(sessionId, null, true)
    assert.equal(completed?.snapshot.history?.leafId, "first")
    assert.deepEqual(
      completed?.snapshot.entries.map((entry) => entry.id),
      ["first"]
    )
    assert.deepEqual(completed?.live.messages, [])
  })
})

test("selected file sync is deferred during output while a prior leaf stays pinned", async () => {
  await withSessionFixture(async ({ file, sessionId, append, setLive }) => {
    await append([message("base", null, "earlier")])
    await syncPiSessionFile(file)
    const live = new RuntimeLiveState("base")
    live.store.restore({
      messages: [
        {
          id: 0,
          role: "assistant",
          parts: [{ type: "text", text: "streaming" }],
          complete: false,
        },
      ],
      tools: [],
      activeMessageIds: [["assistant", 0]],
      nextMessageId: 1,
      runtimeStatus: "busy",
    })
    setLive(live, "busy")
    await append([message("new", "base", "on disk now")])

    const during = await getSessionView(sessionId, "base", true)
    assert.equal(during?.snapshot.history?.leafId, "base")
    assert.deepEqual(
      during?.snapshot.entries.map((entry) => entry.id),
      ["base"]
    )
    assert.equal(during?.snapshot.history?.extendsLeaf, true)
    assert.equal(during?.live.messages[0]?.parts[0]?.type, "text")
    assert.equal(during?.selectedFileSync, "deferred")
  })
})

test("busy runtime with no message and a tools-only runtime still pin the live base", async () => {
  await withSessionFixture(async ({ sessionId, append, setLive }) => {
    await append([message("first", null, "already written")])
    const busy = new RuntimeLiveState(null)
    setLive(busy, "busy")
    assert.equal(
      (await getSessionView(sessionId, null, true))?.snapshot.history?.leafId,
      null
    )

    const tool = new RuntimeLiveState(null)
    tool.store.restore({
      messages: [],
      tools: [{ id: "tool-1", name: "read", arguments: {}, status: "running" }],
      activeMessageIds: [],
      nextMessageId: 0,
      runtimeStatus: "ready",
    })
    setLive(tool, "ready")
    const toolsOnly = await getSessionView(sessionId, null, true)
    assert.equal(toolsOnly?.snapshot.history?.leafId, null)
    assert.equal(toolsOnly?.live.tools.length, 1)
  })
})

test("idle selected refresh reads the latest disk leaf while ordinary live views stay pinned", async () => {
  await withSessionFixture(async ({ sessionId, append, setLive }) => {
    await append([message("first", null, "written while idle")])
    setLive(new RuntimeLiveState(null), "ready")

    const ordinary = await getSessionView(sessionId, null, false)
    assert.equal(ordinary?.snapshot.history?.leafId, null)
    const selected = await getSessionView(sessionId, null, true)
    assert.equal(selected?.snapshot.history?.leafId, "first")
    assert.deepEqual(
      selected?.snapshot.entries.map((entry) => entry.id),
      ["first"]
    )
  })
})

test("active pinned history reports when an external rewrite changes its indexed entry", async () => {
  await withSessionFixture(
    async ({ file, sessionId, append, write, setLive }) => {
      await append([message("base", null, "original")])
      await syncPiSessionFile(file)
      const database = await getDatabase()
      const before = database
        .prepare("SELECT index_generation FROM sessions WHERE id = ?")
        .get(sessionId)?.index_generation
      setLive(new RuntimeLiveState("base"), "busy")
      await write([message("replacement", null, "rewritten")])

      await assert.rejects(
        getSessionView(sessionId, null, true),
        /view\.jsonl:2:/i
      )
      const after = database
        .prepare("SELECT index_generation FROM sessions WHERE id = ?")
        .get(sessionId)?.index_generation
      assert.equal(after, Number(before))
    }
  )
})

test("selected sync rejects a missing indexed live base", async () => {
  await withSessionFixture(
    async ({ file, sessionId, append, write, setLive }) => {
      await append([message("base", null, "original")])
      await syncPiSessionFile(file)
      setLive(new RuntimeLiveState("base"), "busy")
      await write([message("different", null, "replacement")])
      await assert.rejects(
        getSessionView(sessionId, null, true),
        /view\.jsonl:2:/i
      )
    }
  )
})

test("a live runtime disappearing during selected sync retries against the idle disk leaf", async () => {
  await withSessionFixture(
    async ({ sessionId, supervisor, append, setLive }) => {
      await append([message("first", null, "durable")])
      setLive(new RuntimeLiveState(null), "busy")
      const original = supervisor.liveState.bind(supervisor)
      let reads = 0
      supervisor.liveState = (id) => {
        const captured = original(id)
        if (++reads === 1) setLive(null, "stopped")
        return captured
      }

      const view = await getSessionView(sessionId, null, true)
      assert.equal(view?.snapshot.history?.leafId, "first")
      assert.deepEqual(
        view?.snapshot.entries.map((entry) => entry.id),
        ["first"]
      )
      assert.ok(reads >= 4)
    }
  )
})

test("a live runtime appearing during selected sync retries to keep disk entries behind it", async () => {
  await withSessionFixture(
    async ({ sessionId, supervisor, append, setLive }) => {
      await append([message("first", null, "durable")])
      const original = supervisor.liveState.bind(supervisor)
      let reads = 0
      supervisor.liveState = (id) => {
        const captured = original(id)
        if (++reads === 1) setLive(new RuntimeLiveState(null), "busy")
        return captured
      }

      const view = await getSessionView(sessionId, null, true)
      assert.equal(view?.snapshot.history?.leafId, null)
      assert.deepEqual(view?.snapshot.entries, [])
      assert.ok(reads >= 4)
    }
  )
})

test("a checkpoint during selected sync re-reads the advanced base", async () => {
  await withSessionFixture(
    async ({ sessionId, supervisor, append, setLive }) => {
      await append([message("first", null, "durable")])
      const live = new RuntimeLiveState(null)
      setLive(live, "busy")
      const original = supervisor.liveState.bind(supervisor)
      let reads = 0
      supervisor.liveState = (id) => {
        const captured = original(id)
        if (++reads === 1) {
          live.checkpoint(live.revision, "first")
          setLive(live, "ready")
        }
        return captured
      }

      const view = await getSessionView(sessionId, null, true)
      assert.equal(view?.snapshot.history?.leafId, "first")
      assert.deepEqual(view?.live.messages, [])
      assert.ok(reads >= 4)
    }
  )
})

test("a new live instance with the same base triggers a coherent retry without chasing deltas", async () => {
  await withSessionFixture(
    async ({ sessionId, supervisor, append, setLive }) => {
      await append([message("first", null, "durable")])
      setLive(new RuntimeLiveState(null), "busy")
      const original = supervisor.liveState.bind(supervisor)
      let reads = 0
      supervisor.liveState = (id) => {
        const captured = original(id)
        if (++reads === 1) setLive(new RuntimeLiveState(null), "busy")
        return captured
      }

      const view = await getSessionView(sessionId, null, true)
      assert.equal(view?.snapshot.history?.leafId, null)
      assert.ok(reads >= 4)

      let deltaReads = 0
      const active = new RuntimeLiveState(null)
      setLive(active, "busy")
      supervisor.liveState = (id) => {
        deltaReads++
        active.revision++
        return original(id)
      }
      assert.equal(
        (await getSessionView(sessionId, null, true))?.snapshot.history?.leafId,
        null
      )
      assert.equal(deltaReads, 2)
    }
  )
})

test("a replaced live instance retries a missing-base read against its new base", async () => {
  await withSessionFixture(
    async ({ file, sessionId, append, write, setLive, supervisor }) => {
      await append([message("old", null, "old content")])
      await syncPiSessionFile(file)
      setLive(new RuntimeLiveState("old"), "busy")
      await write([message("new", null, "new content")])
      const original = supervisor.liveState.bind(supervisor)
      let reads = 0
      supervisor.liveState = (id) => {
        const captured = original(id)
        if (++reads === 1) setLive(new RuntimeLiveState("new"), "busy")
        return captured
      }

      const view = await getSessionView(sessionId, null, true)
      assert.equal(view?.snapshot.history?.leafId, "new")
      assert.deepEqual(
        view?.snapshot.entries.map((entry) => entry.id),
        ["new"]
      )
      assert.ok(reads >= 4)
    }
  )
})

test("a settled checkpoint may rebase the live view to its rewritten file", async () => {
  await withSessionFixture(
    async ({ file, sessionId, append, write, setLive, supervisor }) => {
      await append([message("base", null, "original")])
      await syncPiSessionFile(file)
      const live = new RuntimeLiveState("base")
      setLive(live, "busy")
      await write([
        message("base", null, "rewritten"),
        message("new", "base", "next"),
      ])
      const original = supervisor.liveState.bind(supervisor)
      supervisor.liveState = (id) => {
        const captured = original(id)
        if (live.baseLeafId === "base") {
          live.checkpoint(live.revision, "new")
          setLive(live, "ready")
        }
        return captured
      }

      const view = await getSessionView(sessionId, null, true)
      assert.equal(view?.runtime.status, "ready")
      assert.equal(view?.snapshot.history?.leafId, "new")
      assert.deepEqual(view?.snapshot.entries.map((entry) => entry.id), ["base", "new"])
      assert.deepEqual(view?.live.messages, [])
    }
  )
})

test("a failed read retries against a settled checkpoint's authoritative file", async () => {
  await withSessionFixture(
    async ({ file, sessionId, append, write, setLive, supervisor }) => {
      await append([message("base", null, "original")])
      await syncPiSessionFile(file)
      const live = new RuntimeLiveState("base")
      setLive(live, "busy")
      await write([message("new", null, "replaced")])
      const original = supervisor.liveState.bind(supervisor)
      supervisor.liveState = (id) => {
        const captured = original(id)
        if (live.baseLeafId === "base") {
          live.checkpoint(live.revision, "new")
          setLive(live, "ready")
        }
        return captured
      }

      const view = await getSessionView(sessionId, null, true)
      assert.equal(view?.runtime.status, "ready")
      assert.equal(view?.snapshot.history?.leafId, "new")
      assert.deepEqual(view?.snapshot.entries.map((entry) => entry.id), ["new"])
      assert.deepEqual(view?.live.messages, [])
    }
  )
})

test("supervisor supplies identity for a retained live object whose capture has none", () => {
  const supervisor = new RuntimeSupervisor(new EventHub())
  const runtimes = (
    supervisor as unknown as {
      runtimes: Map<
        string,
        {
          status: RuntimeStatus
          live: RuntimeLiveState
          child: { kill(): boolean }
        }
      >
    }
  ).runtimes
  const original = new RuntimeLiveState("base")
  const managed = {
    status: "busy" as RuntimeStatus,
    live: original,
    child: { kill: () => true },
  }
  runtimes.set("legacy", managed)
  try {
    assert.equal("instance" in original.capture("busy"), false)
    const first =
      RuntimeSupervisor.reuseAfterHotReload(supervisor).liveState("legacy")
    const same = supervisor.liveState("legacy")
    assert.equal(first?.instance, original)
    assert.equal(same?.instance, first?.instance)

    managed.live = new RuntimeLiveState("base")
    const replaced = supervisor.liveState("legacy")
    assert.equal(replaced?.baseLeafId, first?.baseLeafId)
    assert.notEqual(replaced?.instance, first?.instance)
  } finally {
    runtimes.delete("legacy")
  }
})

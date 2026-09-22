import assert from "node:assert/strict"
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { SessionManager } from "@earendil-works/pi-coding-agent"

import {
  cleanupDraftSession,
  prepareDraftSession,
  promoteDraftSession,
} from "./session-draft.js"

test("draft sessions use private storage and promote the complete tree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-worker-draft-"))
  const cwd = path.join(root, "project")
  const sessionDirectory = path.join(root, "sessions")
  const draftDirectory = path.join(root, "private-draft")
  await mkdir(cwd, { recursive: true })

  try {
    const manager = SessionManager.create(cwd, sessionDirectory)
    const promotionTarget = manager.getSessionFile()
    assert.ok(promotionTarget)
    const sessionId = manager.getSessionId()
    const draft = prepareDraftSession(manager, draftDirectory)

    assert.equal(draft.promotionTarget, promotionTarget)
    assert.equal(manager.getSessionFile(), draft.privateSessionFile)
    assert.equal(manager.getSessionDir(), sessionDirectory)
    await access(draft.privateSessionFile)
    await assert.rejects(access(promotionTarget))
    assert.equal(manager.getSessionId(), sessionId)
    assert.deepEqual(
      JSON.parse((await readFile(draft.privateSessionFile, "utf8")).trim()),
      manager.getHeader()
    )

    const first = manager.appendCustomEntry("first", { value: 1 })
    const second = manager.appendCustomEntry("second", { value: 2 })
    manager.branch(first)
    const leaf = manager.appendCustomEntry("branch", { value: 3 })
    assert.equal(manager.getLeafId(), leaf)

    promoteDraftSession(manager, draft, promotionTarget)
    assert.equal(manager.getSessionFile(), promotionTarget)
    assert.equal(manager.getLeafId(), leaf)
    assert.deepEqual(
      manager.getEntries().map((entry) => entry.id),
      [first, second, leaf]
    )

    const promoted = SessionManager.open(promotionTarget, sessionDirectory)
    assert.equal(promoted.getSessionId(), sessionId)
    assert.equal(promoted.getLeafId(), leaf)
    assert.deepEqual(promoted.getEntries(), manager.getEntries())

    cleanupDraftSession(draft)
    await assert.rejects(access(draft.privateSessionFile))
    await assert.rejects(stat(draft.draftDirectory))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("draft promotion refuses to overwrite an existing SDK destination", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-worker-draft-"))
  const cwd = path.join(root, "project")
  const sessionDirectory = path.join(root, "sessions")
  const draftDirectory = path.join(root, "private-draft")
  await mkdir(cwd, { recursive: true })

  try {
    const manager = SessionManager.create(cwd, sessionDirectory)
    const draft = prepareDraftSession(manager, draftDirectory)
    const target = draft.promotionTarget
    await writeFile(target, "existing\n")

    assert.throws(
      () => promoteDraftSession(manager, draft, target),
      /EEXIST|already exists/
    )
    assert.equal(manager.getSessionFile(), draft.privateSessionFile)
    await access(draft.privateSessionFile)
    cleanupDraftSession(draft)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

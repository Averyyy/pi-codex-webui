import assert from "node:assert/strict"
import test from "node:test"

import type { ComposerImage } from "@/lib/prompt-images"

import {
  draftAfterAcceptedSend,
  NEW_CONVERSATION_DRAFT_ID,
  parseUpdateDraftHandoff,
  readUpdateDraftHandoff,
  SessionComposerDraftStore,
  SESSION_DRAFT_STORAGE_PREFIX,
  UPDATE_DRAFT_HANDOFF_STORAGE_KEY,
  writeUpdateDraftHandoff,
  restoreUpdateDraftHandoff,
} from "./session-composer-draft-store"

const image: ComposerImage = {
  type: "image",
  data: "cGl4ZWw=",
  mimeType: "image/png",
  id: "image-1",
  name: "pixel.png",
}

test("keeps text and images isolated by session", () => {
  const store = new SessionComposerDraftStore()

  store.setText("session-a", "draft a")
  store.setImages("session-a", [image])
  store.setText("session-b", "draft b")

  assert.deepEqual(store.read("session-a"), {
    text: "draft a",
    images: [image],
  })
  assert.deepEqual(store.read("session-b"), {
    text: "draft b",
    images: [],
  })
})

test("clearing one draft does not affect another session", () => {
  const store = new SessionComposerDraftStore()
  store.setText("session-a", "draft a")
  store.setImages("session-a", [image])
  store.setText("session-b", "draft b")

  store.setText("session-a", "")
  assert.deepEqual(store.read("session-a"), { text: "", images: [image] })

  store.setImages("session-a", [])
  assert.deepEqual(store.read("session-a"), { text: "", images: [] })
  assert.deepEqual(store.read("session-b"), { text: "draft b", images: [] })
})

test("stores and clears the shared new-conversation draft", () => {
  const store = new SessionComposerDraftStore()
  store.setText(NEW_CONVERSATION_DRAFT_ID, "draft across projects")
  store.setImages(NEW_CONVERSATION_DRAFT_ID, [image])

  assert.deepEqual(store.read(NEW_CONVERSATION_DRAFT_ID), {
    text: "draft across projects",
    images: [image],
  })

  store.setText(NEW_CONVERSATION_DRAFT_ID, "")
  store.setImages(NEW_CONVERSATION_DRAFT_ID, [])
  assert.deepEqual(store.read(NEW_CONVERSATION_DRAFT_ID), {
    text: "",
    images: [],
  })
})

test("clears only the exact draft snapshot accepted by the runtime", () => {
  assert.equal(
    draftAfterAcceptedSend("  keep spacing  ", "  keep spacing  "),
    ""
  )
  assert.equal(
    draftAfterAcceptedSend("keep spacing\n", "keep spacing"),
    "keep spacing\n"
  )
})

test("round-trips the update-only draft handoff and clears it after restore", () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  const source = new SessionComposerDraftStore()
  source.setText("session-a", "draft across reload")
  source.setImages("session-a", [image])

  writeUpdateDraftHandoff(source, storage)
  assert.ok(values.has(UPDATE_DRAFT_HANDOFF_STORAGE_KEY))

  const restored = new SessionComposerDraftStore()
  assert.equal(restoreUpdateDraftHandoff(restored, storage), true)
  assert.deepEqual(restored.read("session-a"), source.read("session-a"))
  assert.equal(values.has(UPDATE_DRAFT_HANDOFF_STORAGE_KEY), false)
})

test("reports invalid and quota-limited update handoffs explicitly", () => {
  assert.throws(
    () => parseUpdateDraftHandoff({ version: 1, drafts: { bad: {} } }),
    /saved composer draft handoff is invalid/
  )
  const store = new SessionComposerDraftStore()
  store.setText("session-a", "draft")
  assert.throws(
    () =>
      writeUpdateDraftHandoff(store, {
        getItem: () => null,
        setItem() {
          throw new Error("quota exceeded")
        },
        removeItem() {},
      }),
    /Could not preserve composer drafts.*quota exceeded/
  )
  assert.equal(readUpdateDraftHandoff({ getItem: () => null }), null)
})

test("tab reload restores isolated text and images without serializing images on typing", () => {
  const values = new Map<string, string>()
  const writes: string[] = []
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key)
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  const source = new SessionComposerDraftStore(storage)
  source.setImages("session-a", [image])
  writes.length = 0
  source.setText("session-a", "first")
  source.setText("session-a", "first and more")
  source.setText("session-b", "other session")
  assert.deepEqual(writes, [
    `${SESSION_DRAFT_STORAGE_PREFIX}session-a:text`,
    `${SESSION_DRAFT_STORAGE_PREFIX}session-a:text`,
    `${SESSION_DRAFT_STORAGE_PREFIX}session-b:text`,
  ])

  const restored = new SessionComposerDraftStore(storage)
  assert.deepEqual(restored.read("session-a"), {
    text: "first and more",
    images: [image],
  })
  assert.deepEqual(restored.read("session-b"), {
    text: "other session",
    images: [],
  })

  restored.setText(
    "session-a",
    draftAfterAcceptedSend("first and more", "first and more")
  )
  restored.setImages("session-a", [])
  assert.equal(
    values.has(`${SESSION_DRAFT_STORAGE_PREFIX}session-a:text`),
    false
  )
  assert.equal(
    values.has(`${SESSION_DRAFT_STORAGE_PREFIX}session-a:images`),
    false
  )
  assert.equal(
    values.get(`${SESSION_DRAFT_STORAGE_PREFIX}session-b:text`),
    "other session"
  )
})

test("draft storage failures are observable while the in-memory draft remains usable", async () => {
  let limited = true
  const store = new SessionComposerDraftStore({
    getItem: () => null,
    setItem: () => {
      if (limited) throw new Error("quota exceeded")
    },
    removeItem: () => {},
  })
  let notifications = 0
  const unsubscribe = store.subscribeStorageError(() => {
    notifications += 1
  })
  store.setText("session-a", "unsent")
  assert.deepEqual(store.read("session-a"), { text: "unsent", images: [] })
  assert.match(store.getStorageError() ?? "", /quota exceeded/)
  assert.equal(notifications, 0)
  await Promise.resolve()
  assert.equal(notifications, 1)
  limited = false
  store.setText("session-a", "unsent and saved")
  assert.equal(store.getStorageError(), null)
  await Promise.resolve()
  assert.equal(notifications, 2)
  unsubscribe()

  const invalid = new SessionComposerDraftStore({
    getItem: (key) => (key.endsWith(":images") ? "not-json" : "still readable"),
    setItem: () => {},
    removeItem: () => {},
  })
  let readNotifications = 0
  invalid.subscribeStorageError(() => {
    readNotifications += 1
  })
  assert.deepEqual(invalid.read("session-a"), {
    text: "still readable",
    images: [],
  })
  assert.match(invalid.getStorageError() ?? "", /Could not read/)
  assert.equal(readNotifications, 0)
  await Promise.resolve()
  assert.equal(readNotifications, 1)
  invalid.setImages("session-a", [])
  assert.equal(invalid.getStorageError(), null)
})

test("large persisted image drafts do not duplicate into the update handoff", () => {
  const values = new Map<string, string>()
  const quota = 5 * 1024 * 1024
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      const nextSize = Array.from(values.entries()).reduce(
        (size, [existingKey, existingValue]) =>
          size + (existingKey === key ? 0 : existingValue.length),
        value.length
      )
      if (nextSize > quota) throw new Error("quota exceeded")
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
  const source = new SessionComposerDraftStore(storage)
  const largeImage = { ...image, data: "a".repeat(3 * 1024 * 1024) }
  source.setImages("session-a", [largeImage])
  source.setText("session-a", "unsent")
  storage.setItem(
    UPDATE_DRAFT_HANDOFF_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      drafts: { "session-a": { text: "stale", images: [] } },
    })
  )

  writeUpdateDraftHandoff(source, storage)
  assert.equal(values.has(UPDATE_DRAFT_HANDOFF_STORAGE_KEY), false)
  assert.deepEqual(new SessionComposerDraftStore(storage).read("session-a"), {
    text: "unsent",
    images: [largeImage],
  })

  values.delete(`${SESSION_DRAFT_STORAGE_PREFIX}session-a:text`)
  assert.throws(
    () => writeUpdateDraftHandoff(source, storage),
    /Could not preserve composer drafts.*quota exceeded/
  )
  assert.equal(values.has(UPDATE_DRAFT_HANDOFF_STORAGE_KEY), false)
})

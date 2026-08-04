import assert from "node:assert/strict"
import test from "node:test"

import type { ComposerImage } from "@/lib/prompt-images"

import {
  draftAfterAcceptedSend,
  NEW_CONVERSATION_DRAFT_ID,
  SessionComposerDraftStore,
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

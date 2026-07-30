import assert from "node:assert/strict"
import test from "node:test"

import type { WebUiViewSnapshot } from "@workspace/runtime-protocol"

import {
  replacesStreamingMessage,
  replacesTranscriptEntry,
} from "@/lib/webui-message-replacements"

const view = {
  version: 1,
  extensionId: "prompt-template-model",
  adapterKey: "builtin:prompt-template-model#prompt-template-model",
  viewId: "prompt-template.message",
  instanceId: "01234567-89ab-4def-8123-456789abcdef",
  placement: "conversation.after",
  revision: 0,
  state: {},
  blocking: false,
  replacesEntry: {
    entryId: "entry-1",
    customType: "skill-loaded",
    messageTimestamp: 42,
  },
} satisfies WebUiViewSnapshot

test("native message cards replace only their exact transcript entry", () => {
  assert.equal(replacesTranscriptEntry([view], "entry-1"), true)
  assert.equal(replacesTranscriptEntry([view], "entry-2"), false)
  assert.equal(replacesTranscriptEntry([], "entry-1"), false)
})

test("native message cards replace the matching live custom message", () => {
  assert.equal(
    replacesStreamingMessage([view], {
      customType: "skill-loaded",
      timestamp: 42,
    }),
    true
  )
  assert.equal(
    replacesStreamingMessage([view], {
      customType: "skill-loaded",
      timestamp: 43,
    }),
    false
  )
  assert.equal(replacesStreamingMessage([view], {}), false)
})

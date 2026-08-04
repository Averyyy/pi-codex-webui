import assert from "node:assert/strict"
import test from "node:test"

import { shouldScrollToSessionTail } from "@/lib/session-scroll"

test("session navigation follows the tail only without a fragment", () => {
  assert.equal(shouldScrollToSessionTail(""), true)
  assert.equal(shouldScrollToSessionTail("#entry-message-1"), false)
  assert.equal(shouldScrollToSessionTail("#other-anchor"), false)
})

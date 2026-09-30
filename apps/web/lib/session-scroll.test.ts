import assert from "node:assert/strict"
import test from "node:test"

import {
  restoreSessionScroll,
  shouldScrollToSessionTail,
} from "@/lib/session-scroll"

test("session navigation follows the tail only without a fragment", () => {
  assert.equal(shouldScrollToSessionTail(""), true)
  assert.equal(shouldScrollToSessionTail("#entry-message-1"), false)
  assert.equal(shouldScrollToSessionTail("#other-anchor"), false)
})

test("scroll restoration finds the anchor inside its own retained viewport", () => {
  const anchor = {
    id: "entry-same-id",
    getBoundingClientRect: () => ({ top: 32 }),
  }
  const container = {
    scrollTop: 10,
    querySelectorAll: () => [anchor],
    getBoundingClientRect: () => ({ top: 20 }),
  } as unknown as HTMLElement
  restoreSessionScroll(container, {
    top: 10,
    following: false,
    anchorId: "entry-same-id",
    anchorOffset: 5,
  })
  assert.equal(container.scrollTop, 17)
})

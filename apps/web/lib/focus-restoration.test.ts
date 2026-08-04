import assert from "node:assert/strict"
import test from "node:test"

import {
  rememberFocusTarget,
  restoreFocusTarget,
  restorePendingFocus,
} from "@workspace/ui/lib/focus-restoration"

test("restores pending focus once after the target is connected", () => {
  const pending = { current: true }
  let focusCount = 0
  const target = {
    isConnected: true,
    focus() {
      focusCount += 1
    },
  }

  assert.equal(restorePendingFocus(pending, target), true)
  assert.equal(pending.current, false)
  assert.equal(focusCount, 1)
  assert.equal(restorePendingFocus(pending, target), false)
  assert.equal(focusCount, 1)
})

test("keeps pending focus until a connected target exists", () => {
  const pending = { current: true }
  let focusCount = 0

  assert.equal(restorePendingFocus(pending, null), false)
  assert.equal(
    restorePendingFocus(pending, {
      isConnected: false,
      focus() {
        focusCount += 1
      },
    }),
    false
  )
  assert.equal(pending.current, true)
  assert.equal(focusCount, 0)
})

test("does not focus when no restoration is pending", () => {
  const pending = { current: false }
  let focusCount = 0

  assert.equal(
    restorePendingFocus(pending, {
      isConnected: true,
      focus() {
        focusCount += 1
      },
    }),
    false
  )
  assert.equal(focusCount, 0)
})

test("restores and consumes the connected trigger that opened the sheet", () => {
  let focusCount = 0
  const triggerRef = {
    current: {
      isConnected: true,
      focus() {
        focusCount += 1
      },
    },
  }

  assert.equal(restoreFocusTarget(triggerRef), true)
  assert.equal(triggerRef.current, null)
  assert.equal(focusCount, 1)
  assert.equal(restoreFocusTarget(triggerRef), false)
  assert.equal(focusCount, 1)
})

test("restores focus to the latest trigger when a page has multiple triggers", () => {
  let firstFocusCount = 0
  let latestFocusCount = 0
  const triggerRef: {
    current: { isConnected: boolean; focus: () => void } | null
  } = { current: null }

  assert.equal(
    rememberFocusTarget(triggerRef, {
      isConnected: true,
      focus() {
        firstFocusCount += 1
      },
    }),
    true
  )
  assert.equal(
    rememberFocusTarget(triggerRef, {
      isConnected: true,
      focus() {
        latestFocusCount += 1
      },
    }),
    true
  )
  assert.equal(restoreFocusTarget(triggerRef), true)
  assert.equal(firstFocusCount, 0)
  assert.equal(latestFocusCount, 1)
})

test("discards a trigger that is no longer connected", () => {
  let focusCount = 0
  const triggerRef = {
    current: {
      isConnected: false,
      focus() {
        focusCount += 1
      },
    },
  }

  assert.equal(restoreFocusTarget(triggerRef), false)
  assert.equal(triggerRef.current, null)
  assert.equal(focusCount, 0)
})

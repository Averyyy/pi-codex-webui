import assert from "node:assert/strict"
import test from "node:test"

import type { TuiSurfaceSnapshot } from "@workspace/runtime-protocol"

import { isVisibleTuiSurface } from "./tui-surface"

function surface(
  overrides: Partial<TuiSurfaceSnapshot> = {}
): TuiSurfaceSnapshot {
  return {
    version: 1,
    surfaceId: "72f4e99c-082c-47f8-a9d5-cc74d38347cd",
    mode: "inline",
    placement: "belowEditor",
    progress: false,
    columns: 104,
    rows: 10,
    revision: 5,
    data: "",
    ...overrides,
  }
}

test("empty inline TUI surfaces stay out of the layout", () => {
  assert.equal(isVisibleTuiSurface(surface()), false)
})

test("inline TUI surfaces appear when they expose visible state", () => {
  assert.equal(isVisibleTuiSurface(surface({ data: "agent output" })), true)
  assert.equal(isVisibleTuiSurface(surface({ title: "Agents" })), true)
  assert.equal(isVisibleTuiSurface(surface({ progress: true })), true)
})

test("interactive TUI surfaces remain mounted before their first write", () => {
  assert.equal(isVisibleTuiSurface(surface({ mode: "dialog" })), true)
  assert.equal(isVisibleTuiSurface(surface({ mode: "overlay" })), true)
  assert.equal(isVisibleTuiSurface(surface({ mode: "editor" })), true)
})

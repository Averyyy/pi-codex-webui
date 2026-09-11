import assert from "node:assert/strict"
import test from "node:test"

import { displaySessionTitle, formatInlinePreview } from "@/lib/session-display"

test("inline previews can cap length without splitting Unicode code points", () => {
  assert.equal(
    formatInlinePreview("Command: echo hello Chunk ID: 63c2e3 Wall time: 0.2030 seconds", 24),
    "Command: echo hello Chu…"
  )
  assert.equal(formatInlinePreview("😀😀😀", 2), "😀…")
})

test("session titles normalize whitespace and ANSI formatting", () => {
  assert.equal(
    displaySessionTitle({
      title: "\u001b[31m  修复\n\t移动端  \u001b[0m",
      firstMessage: "unused",
      projectId: "project-1",
    }),
    "修复 移动端"
  )
})

test("a blank explicit title falls through to the first message", () => {
  assert.equal(
    displaySessionTitle({
      title: " \n\t ",
      firstMessage: "  查看\n最近消息  ",
      projectId: "project-1",
    }),
    "查看 最近消息"
  )
})

test("session titles are capped without splitting Unicode code points", () => {
  const title = displaySessionTitle({
    title: `任务 ${"😀".repeat(140)}`,
    firstMessage: "unused",
    projectId: null,
  })

  assert.equal(Array.from(title).length, 120)
  assert.equal(title.endsWith("…"), true)
  assert.equal(title.includes("�"), false)
})

test("empty sessions keep context-specific fallback titles", () => {
  assert.equal(
    displaySessionTitle({ title: null, firstMessage: "", projectId: null }),
    "新任务"
  )
  assert.equal(
    displaySessionTitle({
      title: null,
      firstMessage: "",
      projectId: "project-1",
    }),
    "未命名会话"
  )
})

test("empty sessions accept localized fallback titles", () => {
  const fallback = { task: "New task", conversation: "Untitled conversation" }

  assert.equal(
    displaySessionTitle(
      { title: null, firstMessage: "", projectId: null },
      fallback
    ),
    "New task"
  )
  assert.equal(
    displaySessionTitle(
      { title: null, firstMessage: "", projectId: "project-1" },
      fallback
    ),
    "Untitled conversation"
  )
})

import assert from "node:assert/strict"
import test from "node:test"

import { stripAnsi } from "./ansi"

test("stripAnsi removes terminal color sequences while preserving content", () => {
  assert.equal(
    stripAnsi(
      "\u001b[38;5;241m○\u001b[39m 🐴 \u001b[38;5;244mponytail: \u001b[39m\u001b[38;5;188m⚡ FULL\u001b[39m"
    ),
    "○ 🐴 ponytail: ⚡ FULL"
  )
})

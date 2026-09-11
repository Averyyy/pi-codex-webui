import assert from "node:assert/strict"
import test from "node:test"

import { composerCommandDescription } from "./composer-command-text"

test("keeps a short command description", () => {
  assert.equal(
    composerCommandDescription("Show MCP server status"),
    "Show MCP server status"
  )
})

test("truncates the first sentence of a long slash-command help blob", () => {
  const description = composerCommandDescription(
    "All pi-chrome controls in one place. /chrome authorize [15m|30m|<minutes>|indefinite] — allow this Pi session to use chrome_* tools. /chrome revoke — lock Chrome control."
  )
  assert.equal(description, "All pi-chrome controls in one place.")
  assert.equal(description.includes("authorize"), false)
})

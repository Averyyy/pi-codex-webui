import assert from "node:assert/strict"
import test from "node:test"

import type { WebUiExtensionCandidateView } from "@/lib/webui-extensions/types"
import { isExtensionCandidateAvailable } from "@/lib/webui-extensions/authorization"

function candidate(source: WebUiExtensionCandidateView["source"]) {
  return { source } as WebUiExtensionCandidateView
}

test("project trust gates project extensions without disabling global extensions", () => {
  assert.equal(isExtensionCandidateAvailable(candidate("builtin"), false), true)
  assert.equal(
    isExtensionCandidateAvailable(candidate("external"), false),
    true
  )
  assert.equal(
    isExtensionCandidateAvailable(candidate("project"), false),
    false
  )
  assert.equal(isExtensionCandidateAvailable(candidate("project"), true), true)
  assert.equal(
    isExtensionCandidateAvailable(candidate("project"), true, true),
    false
  )
})

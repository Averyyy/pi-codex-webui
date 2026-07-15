import assert from "node:assert/strict"
import test from "node:test"

import type { ResourceCatalog } from "@workspace/runtime-protocol"

import {
  hasTintinSubagentsExtension,
  TINTIN_SUBAGENTS_PACKAGE,
} from "./subagents"

function catalog(
  packageSource: string,
  options: { enabled?: boolean; missing?: boolean } = {}
): ResourceCatalog {
  return {
    cwd: "/tmp/project",
    projectTrusted: true,
    trustRequired: false,
    packages: [],
    resources: [
      {
        id: "extension-1",
        type: "extension",
        name: "index.ts",
        scope: "global",
        source: "package",
        sourcePath: "/tmp/index.ts",
        packageSource,
        enabled: options.enabled ?? true,
        inherited: false,
        overridden: false,
        missing: options.missing ?? false,
        reloadRequired: false,
      },
    ],
  }
}

test("detects only the enabled scoped tintin subagents extension", () => {
  assert.equal(
    hasTintinSubagentsExtension(catalog(TINTIN_SUBAGENTS_PACKAGE)),
    true
  )
  assert.equal(hasTintinSubagentsExtension(catalog("npm:pi-subagents")), false)
  assert.equal(
    hasTintinSubagentsExtension(
      catalog(TINTIN_SUBAGENTS_PACKAGE, { enabled: false })
    ),
    false
  )
  assert.equal(hasTintinSubagentsExtension(null), false)
})

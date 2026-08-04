import assert from "node:assert/strict"
import test from "node:test"

import { selectSettingsProject } from "./settings-project-selection"

const projects = [
  { id: "first", name: "First" },
  { id: "second", name: "Second" },
]

test("missing project query defaults to the first workspace project", () => {
  assert.deepEqual(selectSettingsProject(projects, undefined), {
    project: projects[0],
    invalid: false,
  })
  assert.deepEqual(selectSettingsProject([], undefined), {
    project: null,
    invalid: false,
  })
})

test("explicit project queries never silently fall back", () => {
  assert.deepEqual(selectSettingsProject(projects, "second"), {
    project: projects[1],
    invalid: false,
  })
  assert.deepEqual(selectSettingsProject(projects, "missing"), {
    project: null,
    invalid: true,
  })
  assert.deepEqual(selectSettingsProject(projects, ""), {
    project: null,
    invalid: true,
  })
  assert.deepEqual(selectSettingsProject(projects, ["first", "second"]), {
    project: null,
    invalid: true,
  })
})

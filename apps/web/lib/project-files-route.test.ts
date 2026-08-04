import assert from "node:assert/strict"
import test from "node:test"

import {
  canonicalProjectFilesHref,
  projectFileAttachmentHeader,
  projectFilesHref,
  requestedProjectFilePath,
} from "./project-files-route"

test("project file links keep the root URL clean and encode nested paths", () => {
  assert.equal(projectFilesHref("project-a", ""), "/projects/project-a/files")
  assert.equal(
    projectFilesHref("project-a", "目录/file name.txt"),
    "/projects/project-a/files?path=%E7%9B%AE%E5%BD%95%2Ffile+name.txt"
  )
})

test("project file downloads encode RFC 5987 reserved filename characters", () => {
  assert.equal(
    projectFileAttachmentHeader("read me's (copy)*!.txt"),
    "attachment; filename*=UTF-8''read%20me%27s%20%28copy%29%2A%21.txt"
  )
})

test("project file queries use the first repeated value like URLSearchParams", () => {
  assert.equal(requestedProjectFilePath(undefined), "")
  assert.equal(requestedProjectFilePath("src/index.ts"), "src/index.ts")
  assert.equal(
    requestedProjectFilePath(["src/index.ts", "ignored.ts"]),
    "src/index.ts"
  )
})

test("project file queries canonicalize repeated, blank, and resolved paths", () => {
  assert.equal(canonicalProjectFilesHref("project-a", undefined, ""), null)
  assert.equal(
    canonicalProjectFilesHref("project-a", "src/index.ts", "src/index.ts"),
    null
  )
  assert.equal(
    canonicalProjectFilesHref(
      "project-a",
      ["src/index.ts", "ignored.ts"],
      "src/index.ts"
    ),
    "/projects/project-a/files?path=src%2Findex.ts"
  )
  assert.equal(
    canonicalProjectFilesHref("project-a", "src/../README.md", "README.md"),
    "/projects/project-a/files?path=README.md"
  )
  assert.equal(
    canonicalProjectFilesHref("project-a", "", ""),
    "/projects/project-a/files"
  )
})

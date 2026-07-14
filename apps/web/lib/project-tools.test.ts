import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import {
  ProjectFileError,
  readProjectEntry,
  readProjectFile,
} from "./project-files"
import { readProjectGitStatus } from "./project-git"

const run = promisify(execFile)

test("project file browser reads real files and blocks paths outside its root", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "pi-web-files-"))
  const project = path.join(directory, "project")
  const outside = path.join(directory, "outside.txt")
  await mkdir(path.join(project, "src"), { recursive: true })
  await Promise.all([
    writeFile(path.join(project, "README.md"), "# Fixture\n"),
    writeFile(path.join(project, "binary.dat"), Uint8Array.from([0xff, 0xfe])),
    writeFile(path.join(project, "large.txt"), Buffer.alloc(1024 * 1024 + 1)),
    writeFile(outside, "outside"),
  ])
  await symlink(outside, path.join(project, "outside-link"))

  const root = await readProjectEntry(project)
  assert.equal(root.kind, "directory")
  assert.deepEqual(
    root.entries.map((entry) => entry.name),
    ["src", "binary.dat", "large.txt", "outside-link", "README.md"]
  )

  const text = await readProjectEntry(project, "README.md")
  assert.equal(text.kind, "file")
  assert.equal(text.preview, "# Fixture\n")
  const binary = await readProjectEntry(project, "binary.dat")
  assert.equal(binary.kind, "file")
  assert.equal(binary.previewUnavailable, "binary")
  const large = await readProjectEntry(project, "large.txt")
  assert.equal(large.kind, "file")
  assert.equal(large.previewUnavailable, "too-large")
  assert.equal(
    (await readProjectFile(project, "README.md")).contents.toString(),
    "# Fixture\n"
  )

  await assert.rejects(
    readProjectEntry(project, "../outside.txt"),
    (error: unknown) =>
      error instanceof ProjectFileError && error.code === "OutsideProject"
  )
  await assert.rejects(
    readProjectEntry(project, "outside-link"),
    (error: unknown) =>
      error instanceof ProjectFileError && error.code === "OutsideProject"
  )
  await rm(directory, { recursive: true, force: true })
  await assert.rejects(
    readProjectEntry(project),
    (error: unknown) =>
      error instanceof ProjectFileError && error.code === "Unavailable"
  )
})

test("project Git integration reports the real branch and working tree", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "pi-web-git-"))
  await run("git", ["init", project])
  await run("git", ["-C", project, "config", "user.name", "Fixture"])
  await run("git", [
    "-C",
    project,
    "config",
    "user.email",
    "fixture@example.com",
  ])
  await writeFile(path.join(project, "tracked.txt"), "first\n")
  await run("git", ["-C", project, "add", "tracked.txt"])
  await run("git", ["-C", project, "commit", "-m", "fixture"])
  await Promise.all([
    writeFile(path.join(project, "tracked.txt"), "changed\n"),
    writeFile(path.join(project, "untracked.txt"), "new\n"),
  ])

  const status = await readProjectGitStatus(project)
  assert.equal(status.available, true)
  if (status.available) {
    assert.ok(status.branch)
    assert.ok(status.commit)
    assert.deepEqual(
      status.files.map((file) => [file.index, file.workingTree, file.path]),
      [
        [" ", "M", "tracked.txt"],
        ["?", "?", "untracked.txt"],
      ]
    )
  }
  await rm(project, { recursive: true, force: true })
})

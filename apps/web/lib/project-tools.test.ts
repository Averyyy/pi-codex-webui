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
import {
  createProjectWorktree,
  readProjectGitDiff,
  readProjectGitStatus,
} from "./project-git"
import {
  decodeProjectDirectoryPickerOutput,
  projectDirectoryPicker,
} from "./project-directory-picker"
import { projectFileManager } from "./project-reveal"
import { shellCommand } from "./shell-supervisor"

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
  const worktree = `${project}-worktree`
  await createProjectWorktree(project, worktree, "fixture-worktree")
  assert.equal(
    (
      await run("git", ["-C", worktree, "branch", "--show-current"])
    ).stdout.trim(),
    "fixture-worktree"
  )
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
  const trackedDiff = await readProjectGitDiff(project, "tracked.txt")
  assert.match(trackedDiff.hunks[0] ?? "", /^diff --git/m)
  assert.match(trackedDiff.hunks[0] ?? "", /^--- /m)
  assert.match(trackedDiff.hunks[0] ?? "", /^\+\+\+ /m)
  assert.match(trackedDiff.hunks.join("\n"), /-first\n\+changed/)
  const untrackedDiff = await readProjectGitDiff(project, "untracked.txt")
  assert.match(untrackedDiff.hunks[0] ?? "", /^diff --git/m)
  assert.match(untrackedDiff.hunks.join("\n"), /\+new/)
  await Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(worktree, { recursive: true, force: true }),
  ])
})

test("desktop integrations select native macOS and Windows commands", () => {
  assert.deepEqual(projectFileManager("darwin"), {
    command: "/usr/bin/open",
    label: "在 Finder 中打开",
  })
  assert.deepEqual(projectFileManager("win32"), {
    command: "explorer.exe",
    label: "在文件资源管理器中打开",
  })
  assert.equal(projectFileManager("linux"), null)

  const macPicker = projectDirectoryPicker("darwin")
  assert.ok(macPicker)
  assert.equal(macPicker.command, "/usr/bin/osascript")
  assert.deepEqual(macPicker.args.slice(0, 1), ["-e"])
  assert.match(macPicker.args[1] ?? "", /choose folder/)
  assert.equal(
    decodeProjectDirectoryPickerOutput(macPicker, "/tmp/project\n"),
    "/tmp/project"
  )
  assert.equal(decodeProjectDirectoryPickerOutput(macPicker, "\n"), null)

  const windowsPicker = projectDirectoryPicker("win32")
  assert.ok(windowsPicker)
  assert.equal(windowsPicker.command, "powershell.exe")
  assert.match(windowsPicker.args.at(-1) ?? "", /FolderBrowserDialog/)
  assert.equal(
    decodeProjectDirectoryPickerOutput(windowsPicker, "C:\\project"),
    "C:\\project"
  )
  assert.equal(projectDirectoryPicker("linux"), null)

  assert.deepEqual(shellCommand("darwin", { SHELL: "/bin/zsh" }), {
    file: "/bin/zsh",
    args: ["-l"],
  })
  assert.deepEqual(shellCommand("win32", { ComSpec: "cmd.exe" }), {
    file: "cmd.exe",
    args: [],
  })
})

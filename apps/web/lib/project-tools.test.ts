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
import { projectFileErrorCopy } from "./project-file-display"
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

test("project file errors are localized from stable error codes", () => {
  assert.deepEqual(projectFileErrorCopy("InvalidPath", "zh-CN"), {
    title: "无法打开路径",
    description: "请求的项目路径无效或不存在。",
  })
  assert.deepEqual(projectFileErrorCopy("InvalidPath", "en-US"), {
    title: "Unable to open path",
    description: "The requested project path is invalid or missing.",
  })
  assert.equal(
    projectFileErrorCopy("OutsideProject", "zh-CN").description,
    "请求的路径位于项目目录之外。"
  )
  assert.equal(
    projectFileErrorCopy("OutsideProject", "en-US").description,
    "The requested path is outside the project."
  )
})

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
    (error: unknown) => {
      assert.ok(error instanceof ProjectFileError)
      assert.equal(error.code, "OutsideProject")
      assert.equal(error.message, "The requested path is outside the project.")
      return true
    }
  )
  await assert.rejects(
    readProjectEntry(project, "outside-link"),
    (error: unknown) =>
      error instanceof ProjectFileError && error.code === "OutsideProject"
  )
  await assert.rejects(
    readProjectEntry(project, "missing.txt"),
    (error: unknown) => {
      assert.ok(error instanceof ProjectFileError)
      assert.equal(error.code, "InvalidPath")
      assert.equal(error.message, "The requested project path does not exist.")
      return true
    }
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
  await writeFile(path.join(project, "rename-source.txt"), "rename me\n")
  await run("git", ["-C", project, "add", "tracked.txt", "rename-source.txt"])
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
  await run("git", [
    "-C",
    project,
    "mv",
    "rename-source.txt",
    "rename-target.txt",
  ])

  const status = await readProjectGitStatus(project)
  assert.equal(status.available, true)
  if (status.available) {
    assert.ok(status.branch)
    assert.ok(status.commit)
    assert.deepEqual(
      status.files
        .filter((file) => file.originalPath === null)
        .map((file) => [file.index, file.workingTree, file.path]),
      [
        [" ", "M", "tracked.txt"],
        ["?", "?", "untracked.txt"],
      ]
    )
    assert.deepEqual(
      status.files.find((file) => file.originalPath !== null),
      {
        index: "R",
        workingTree: " ",
        path: "rename-target.txt",
        originalPath: "rename-source.txt",
      }
    )
  }
  const trackedDiff = await readProjectGitDiff(project, "tracked.txt")
  assert.match(trackedDiff.hunks[0] ?? "", /^diff --git/m)
  assert.match(trackedDiff.hunks[0] ?? "", /^--- /m)
  assert.match(trackedDiff.hunks[0] ?? "", /^\+\+\+ /m)
  assert.match(trackedDiff.hunks.join("\n"), /-first\n\+changed/)
  const untrackedDiff = await readProjectGitDiff(project, "untracked.txt")
  assert.match(
    untrackedDiff.hunks[0] ?? "",
    /^diff --git a\/untracked\.txt b\/untracked\.txt$/m
  )
  assert.match(untrackedDiff.hunks[0] ?? "", /^new file mode 100644$/m)
  assert.match(untrackedDiff.hunks[0] ?? "", /^--- \/dev\/null$/m)
  assert.doesNotMatch(untrackedDiff.hunks[0] ?? "", /pi-web-codex-diff-/)
  assert.match(untrackedDiff.hunks[0] ?? "", /^diff --git/m)
  assert.match(untrackedDiff.hunks.join("\n"), /\+new/)
  const renamedDiff = await readProjectGitDiff(project, "rename-target.txt")
  assert.match(renamedDiff.hunks.join("\n"), /rename from rename-source\.txt/)
  assert.match(renamedDiff.hunks.join("\n"), /rename to rename-target\.txt/)
  await Promise.all([
    rm(project, { recursive: true, force: true }),
    rm(worktree, { recursive: true, force: true }),
  ])
})

test("project Git paths and diffs stay relative to a registered subdirectory", async () => {
  const repository = await mkdtemp(path.join(tmpdir(), "pi-web-git-root-"))
  const project = path.join(repository, "packages", "app")
  await run("git", ["init", repository])
  await run("git", ["-C", repository, "config", "user.name", "Fixture"])
  await run("git", [
    "-C",
    repository,
    "config",
    "user.email",
    "fixture@example.com",
  ])
  await mkdir(project, { recursive: true })
  await writeFile(path.join(project, "tracked.txt"), "first\n")
  await run("git", ["-C", repository, "add", "."])
  await run("git", ["-C", repository, "commit", "-m", "fixture"])
  await Promise.all([
    writeFile(path.join(project, "tracked.txt"), "changed\n"),
    writeFile(path.join(project, "untracked.txt"), "new\n"),
    writeFile(path.join(repository, "outside.txt"), "outside\n"),
  ])

  const status = await readProjectGitStatus(project)
  assert.equal(status.available, true)
  if (status.available) {
    assert.deepEqual(
      status.files.map((file) => file.path),
      ["tracked.txt", "untracked.txt"]
    )
  }
  assert.match(
    (await readProjectGitDiff(project, "tracked.txt")).hunks.join("\n"),
    /-first\n\+changed/
  )
  assert.match(
    (await readProjectGitDiff(project, "untracked.txt")).hunks.join("\n"),
    /\+new/
  )
  await rm(repository, { recursive: true, force: true })
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

import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { watch } from "node:fs"
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"

import { readProjectGitDiff, readProjectGitStatus } from "./project-git"

const run = promisify(execFile)

async function git(projectPath: string, ...args: string[]) {
  await run("git", ["-C", projectPath, ...args])
}

async function createCommittedProject() {
  const project = await mkdtemp(path.join(tmpdir(), "pi-web-codex-git-"))
  await git(project, "init", "-q")
  await git(project, "config", "user.name", "Fixture")
  await git(project, "config", "user.email", "fixture@example.com")
  await writeFile(path.join(project, "tracked.txt"), "first\n")
  await git(project, "add", "tracked.txt")
  await git(project, "commit", "-q", "-m", "fixture")
  return project
}

async function gitDirectorySnapshot(root: string) {
  const entries: Array<[string, string, number, number, number]> = []
  const walk = async (directory: string) => {
    const directoryStat = await stat(directory)
    entries.push([
      path.relative(root, directory) || ".",
      "directory",
      directoryStat.size,
      directoryStat.mtimeMs,
      directoryStat.ino,
    ])
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(entryPath)
      } else {
        const entryStat = await stat(entryPath)
        entries.push([
          path.relative(root, entryPath),
          entry.isSymbolicLink() ? "symlink" : "file",
          entryStat.size,
          entryStat.mtimeMs,
          entryStat.ino,
        ])
      }
    }
  }
  await walk(root)
  return entries.sort(([left], [right]) => left.localeCompare(right))
}

async function watchGitDirectoryTree(root: string) {
  const events: string[] = []
  const watchers: Array<ReturnType<typeof watch>> = []
  const walk = async (directory: string) => {
    watchers.push(
      watch(directory, (_eventType, filename) => {
        events.push(
          `${path.relative(root, directory)}:${String(filename ?? "")}`
        )
      })
    )
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(path.join(directory, entry.name))
    }
  }
  await walk(root)
  return {
    events,
    close() {
      for (const watcher of watchers) watcher.close()
    },
  }
}

function waitForFileEvents() {
  return new Promise<void>((resolve) => setTimeout(resolve, 100))
}

test("read-only status does not refresh a clean repository index", async () => {
  const project = await createCommittedProject()
  const gitDirectory = path.join(project, ".git")
  const indexPath = path.join(gitDirectory, "index")
  const lockPath = path.join(gitDirectory, "index.lock")
  const beforeIndex = await readFile(indexPath)
  const beforeStats = await stat(indexPath)
  const indexEvents: string[] = []
  const watcher = watch(gitDirectory, (_eventType, filename) => {
    const name = String(filename)
    if (name === "index" || name === "index.lock") indexEvents.push(name)
  })

  try {
    try {
      for (let index = 0; index < 5; index += 1) {
        const status = await readProjectGitStatus(project)
        assert.equal(status.available, true)
        if (status.available) assert.deepEqual(status.files, [])
      }
      await waitForFileEvents()
    } finally {
      watcher.close()
    }

    assert.deepEqual(indexEvents, [])
    assert.deepEqual(await readFile(indexPath), beforeIndex)
    const afterStats = await stat(indexPath)
    assert.equal(afterStats.ino, beforeStats.ino)
    assert.equal(afterStats.size, beforeStats.size)
    assert.equal(afterStats.mtimeMs, beforeStats.mtimeMs)
    await assert.rejects(stat(lockPath), { code: "ENOENT" })
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test("status keeps dirty, staged, untracked, and committed writes visible", async () => {
  const project = await createCommittedProject()
  try {
    await writeFile(path.join(project, "tracked.txt"), "changed\n")
    await writeFile(path.join(project, "untracked.txt"), "new\n")

    let status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.deepEqual(
        status.files.map((file) => [file.index, file.workingTree, file.path]),
        [
          [" ", "M", "tracked.txt"],
          ["?", "?", "untracked.txt"],
        ]
      )
      assert.equal(status.additions, 2)
      assert.equal(status.deletions, 1)
    }

    await git(project, "add", "tracked.txt")
    status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.deepEqual(
        status.files.map((file) => [file.index, file.workingTree, file.path]),
        [
          ["M", " ", "tracked.txt"],
          ["?", "?", "untracked.txt"],
        ]
      )
    }

    await git(project, "add", "untracked.txt")
    status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.deepEqual(
        status.files.map((file) => [file.index, file.workingTree, file.path]),
        [
          ["M", " ", "tracked.txt"],
          ["A", " ", "untracked.txt"],
        ]
      )
      assert.equal(status.additions, 2)
      assert.equal(status.deletions, 1)
    }

    assert.match(
      (await readProjectGitDiff(project, "untracked.txt")).hunks.join("\n"),
      /\+new/
    )

    await git(project, "commit", "-q", "-m", "writes")
    status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.deepEqual(status.files, [])
      assert.equal(status.additions, 0)
      assert.equal(status.deletions, 0)
    }

    await writeFile(path.join(project, "tracked.txt"), "after\n")
    status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.deepEqual(
        status.files.map((file) => [file.index, file.workingTree, file.path]),
        [[" ", "M", "tracked.txt"]]
      )
    }
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test("status preserves staged and unstaged files before the first commit", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "pi-web-codex-git-unborn-"))
  try {
    await git(project, "init", "-q")
    await writeFile(path.join(project, "first.txt"), "one\ntwo\n")

    let status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.equal(status.commit, null)
      assert.deepEqual(
        status.files.map((file) => [file.index, file.workingTree, file.path]),
        [["?", "?", "first.txt"]]
      )
      assert.equal(status.additions, 2)
      assert.equal(status.deletions, 0)
    }

    await git(project, "add", "first.txt")
    status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.equal(status.commit, null)
      assert.deepEqual(
        status.files.map((file) => [file.index, file.workingTree, file.path]),
        [["A", " ", "first.txt"]]
      )
      assert.equal(status.additions, 2)
      assert.equal(status.deletions, 0)
    }
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test("status, line stats, and diffs never write the original Git object database", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "pi-web-codex-git-readonly-"))
  const project = path.join(root, "repo")
  await mkdir(project, { recursive: true })
  const gitDirectory = path.join(project, ".git")
  try {
    await git(project, "init", "-q")
    await git(project, "config", "user.name", "Fixture")
    await git(project, "config", "user.email", "fixture@example.com")
    const emptyBlobPath = path.join(root, "existing-empty-blob")
    await writeFile(emptyBlobPath, "")
    const emptyBlob = await run("git", [
      "-C",
      project,
      "hash-object",
      "-w",
      "--",
      emptyBlobPath,
    ])
    await rm(emptyBlobPath)
    assert.equal(
      emptyBlob.stdout.trim(),
      "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391"
    )
    await stat(
      path.join(
        gitDirectory,
        "objects",
        emptyBlob.stdout.trim().slice(0, 2),
        emptyBlob.stdout.trim().slice(2)
      )
    )
    await writeFile(path.join(project, "README.md"), "unborn file\n")

    const readUnborn = async () => {
      const status = await readProjectGitStatus(project)
      assert.equal(status.available, true)
      if (status.available) {
        assert.equal(status.commit, null)
        assert.deepEqual(
          status.files.map(({ index, workingTree, path: filePath }) => [
            index,
            workingTree,
            filePath,
          ]),
          [["?", "?", "README.md"]]
        )
      }
      assert.match(
        (await readProjectGitDiff(project, "README.md")).hunks.join("\n"),
        /\+unborn file/
      )
    }
    const unbornBefore = await gitDirectorySnapshot(gitDirectory)
    const unbornWatcher = await watchGitDirectoryTree(gitDirectory)
    try {
      for (let index = 0; index < 4; index += 1) await readUnborn()
      await waitForFileEvents()
    } finally {
      unbornWatcher.close()
    }
    assert.deepEqual(unbornWatcher.events, [])
    assert.deepEqual(await gitDirectorySnapshot(gitDirectory), unbornBefore)

    await git(project, "add", "README.md")
    await git(project, "commit", "-q", "-m", "initial")
    await writeFile(path.join(project, "empty.txt"), "")
    await git(project, "add", "empty.txt")
    await git(project, "commit", "-q", "-m", "packed empty blob")
    await git(project, "gc", "--prune=now")
    await assert.rejects(
      stat(
        path.join(
          gitDirectory,
          "objects",
          emptyBlob.stdout.trim().slice(0, 2),
          emptyBlob.stdout.trim().slice(2)
        )
      ),
      { code: "ENOENT" }
    )
    assert.ok(
      (await readdir(path.join(gitDirectory, "objects", "pack"))).some(
        (filename) => filename.endsWith(".pack")
      )
    )
    await writeFile(path.join(project, "README.md"), "committed edit\n")
    await writeFile(path.join(project, "notes.txt"), "untracked file\n")

    const readCommitted = async () => {
      const status = await readProjectGitStatus(project)
      assert.equal(status.available, true)
      if (status.available) {
        assert.ok(status.commit)
        assert.deepEqual(
          status.files.map(({ index, workingTree, path: filePath }) => [
            index,
            workingTree,
            filePath,
          ]),
          [
            [" ", "M", "README.md"],
            ["?", "?", "notes.txt"],
          ]
        )
      }
      assert.match(
        (await readProjectGitDiff(project, "notes.txt")).hunks.join("\n"),
        /\+untracked file/
      )
    }
    const committedBefore = await gitDirectorySnapshot(gitDirectory)
    const committedWatcher = await watchGitDirectoryTree(gitDirectory)
    try {
      for (let index = 0; index < 4; index += 1) await readCommitted()
      await waitForFileEvents()
    } finally {
      committedWatcher.close()
    }
    assert.deepEqual(committedWatcher.events, [])
    assert.deepEqual(await gitDirectorySnapshot(gitDirectory), committedBefore)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("temporary Git alternates quote repository paths containing the platform delimiter", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), `pi-web-codex-git${path.delimiter}special-`)
  )
  const project = path.join(root, "repo")
  await mkdir(project, { recursive: true })
  try {
    await git(project, "init", "-q")
    await git(project, "config", "user.name", "Fixture")
    await git(project, "config", "user.email", "fixture@example.com")
    await writeFile(path.join(project, "README.md"), "special path\n")

    const status = await readProjectGitStatus(project)
    assert.equal(status.available, true)
    if (status.available) {
      assert.deepEqual(
        status.files.map((file) => file.path),
        ["README.md"]
      )
    }
    assert.match(
      (await readProjectGitDiff(project, "README.md")).hunks.join("\n"),
      /\+special path/
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

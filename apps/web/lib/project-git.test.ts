import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { watch } from "node:fs"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
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

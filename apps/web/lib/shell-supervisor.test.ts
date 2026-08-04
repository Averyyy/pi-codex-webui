import assert from "node:assert/strict"
import test from "node:test"

import type { IPty } from "node-pty"

import { isRuntimeRequestError } from "./runtime-error"
import { ShellSupervisor } from "./shell-supervisor"

interface ShellSupervisorInternals {
  sessions: Map<
    string,
    {
      cwd: string
      process: IPty | null
      output: string
      exitCode: number | null
      subscribers: Set<unknown>
      closeTimer: NodeJS.Timeout | undefined
      stopped: boolean
    }
  >
}

function internals(supervisor: ShellSupervisor) {
  return supervisor as unknown as ShellSupervisorInternals
}

test("a late terminal resize is an idempotent no-op after stop", () => {
  const supervisor = new ShellSupervisor()
  const state = internals(supervisor)
  const resizes: [number, number][] = []
  let kills = 0
  const process = {
    resize(columns: number, rows: number) {
      resizes.push([columns, rows])
    },
    kill() {
      kills += 1
    },
  } as unknown as IPty
  state.sessions.set("session-a", {
    cwd: "/tmp",
    process,
    output: "",
    exitCode: null,
    subscribers: new Set(),
    closeTimer: undefined,
    stopped: false,
  })

  assert.equal(supervisor.resize("session-a", 100, 30), true)
  assert.equal(supervisor.stop("session-a"), true)
  assert.equal(supervisor.resize("session-a", 120, 40), false)
  assert.deepEqual(resizes, [[100, 30]])
  assert.equal(kills, 1)
})

test("input to a stopped terminal returns a structured conflict", () => {
  const supervisor = new ShellSupervisor()

  assert.throws(
    () => supervisor.input("missing", "echo test\n"),
    (error: unknown) =>
      isRuntimeRequestError(error) &&
      error.code === "RuntimeNotActive" &&
      error.message === "Shell terminal is not running."
  )
})

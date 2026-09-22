import assert from "node:assert/strict"
import test from "node:test"

import {
  defaultWorkspaceNavState,
  readWorkspaceNavState,
  SIDEBAR_PAGE_SIZE,
  WORKSPACE_NAV_STORAGE_KEY,
  writeWorkspaceNavState,
} from "./workspace-nav-persistence"

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem(key: string) {
      assert.equal(key, WORKSPACE_NAV_STORAGE_KEY)
      return value
    },
    setItem(key: string, next: string) {
      assert.equal(key, WORKSPACE_NAV_STORAGE_KEY)
      value = next
    },
  }
}

function withWindow<T>(windowValue: unknown, callback: () => T): T {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window")
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  })
  try {
    return callback()
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "window", previous)
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }
}

test("sidebar expansion counts and fold states round trip through storage", () => {
  const state = {
    ...defaultWorkspaceNavState(),
    projectsVisibleCount: SIDEBAR_PAGE_SIZE * 2,
    pinnedVisibleCount: SIDEBAR_PAGE_SIZE * 3,
    tasksVisibleCount: SIDEBAR_PAGE_SIZE * 4,
    projectSessionVisibleCounts: {
      projectA: SIDEBAR_PAGE_SIZE * 2,
      projectB: SIDEBAR_PAGE_SIZE * 3,
    },
    projectOpen: {
      projectA: false,
      projectB: true,
    },
    tasksOpen: false,
  }
  const storage = memoryStorage()

  assert.deepEqual(writeWorkspaceNavState(state, storage), { error: null })
  assert.deepEqual(readWorkspaceNavState(storage), { state, error: null })
})

test("missing saved sidebar state uses defaults without an error", () => {
  const noStorageResult = withWindow(undefined, () => readWorkspaceNavState())
  assert.deepEqual(noStorageResult, {
    state: defaultWorkspaceNavState(),
    error: null,
  })

  const result = readWorkspaceNavState(memoryStorage())

  assert.deepEqual(result, {
    state: defaultWorkspaceNavState(),
    error: null,
  })
})

test("invalid counts and schemas reset the state with an explicit error", () => {
  const defaults = defaultWorkspaceNavState()
  const invalidValues = [
    {
      ...defaults,
      projectsVisibleCount: SIDEBAR_PAGE_SIZE - 1,
    },
    {
      ...defaults,
      projectOpen: ["projectA"],
    },
  ]

  for (const invalidValue of invalidValues) {
    const result = readWorkspaceNavState(
      memoryStorage(JSON.stringify(invalidValue))
    )
    assert.deepEqual(result, {
      state: defaultWorkspaceNavState(),
      error: "The saved sidebar state is invalid and was reset.",
    })
  }
})

test("storage get and set failures return explicit errors", () => {
  const getFailure = readWorkspaceNavState({
    getItem() {
      throw new Error("storage denied")
    },
  })
  assert.deepEqual(getFailure, {
    state: defaultWorkspaceNavState(),
    error: "The saved sidebar state could not be read from browser storage.",
  })

  const setFailure = writeWorkspaceNavState(defaultWorkspaceNavState(), {
    setItem() {
      throw new Error("storage denied")
    },
  })
  assert.deepEqual(setFailure, {
    error: "The sidebar state could not be saved to browser storage.",
  })
})

test("localStorage property SecurityError is reported and the global is restored", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const securityError = Object.assign(new Error("blocked"), {
    name: "SecurityError",
  })
  const blockedWindow = {}
  Object.defineProperty(blockedWindow, "localStorage", {
    configurable: true,
    get() {
      throw securityError
    },
  })

  withWindow(blockedWindow, () => {
    assert.deepEqual(readWorkspaceNavState(), {
      state: defaultWorkspaceNavState(),
      error: "The saved sidebar state could not be read from browser storage.",
    })
    assert.deepEqual(writeWorkspaceNavState(defaultWorkspaceNavState()), {
      error: "The sidebar state could not be saved to browser storage.",
    })
  })

  assert.deepEqual(
    Object.getOwnPropertyDescriptor(globalThis, "window"),
    previousWindow
  )
})

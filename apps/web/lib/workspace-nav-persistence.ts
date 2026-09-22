export const WORKSPACE_NAV_STORAGE_KEY = "pi-web-codex.workspace-nav.v1"
export const WORKSPACE_NAV_STORAGE_VERSION = 1 as const
export const SIDEBAR_PAGE_SIZE = 5

export interface WorkspaceNavPersistedState {
  version: typeof WORKSPACE_NAV_STORAGE_VERSION
  projectsVisibleCount: number
  pinnedVisibleCount: number
  tasksVisibleCount: number
  projectSessionVisibleCounts: Record<string, number>
  projectOpen: Record<string, boolean>
  tasksOpen: boolean
}

export interface WorkspaceNavStateRead {
  state: WorkspaceNavPersistedState
  error: string | null
}

export interface WorkspaceNavStateWrite {
  error: string | null
}

export function defaultWorkspaceNavState(): WorkspaceNavPersistedState {
  return {
    version: WORKSPACE_NAV_STORAGE_VERSION,
    projectsVisibleCount: SIDEBAR_PAGE_SIZE,
    pinnedVisibleCount: SIDEBAR_PAGE_SIZE,
    tasksVisibleCount: SIDEBAR_PAGE_SIZE,
    projectSessionVisibleCounts: {},
    projectOpen: {},
    tasksOpen: true,
  }
}

function isCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= SIDEBAR_PAGE_SIZE &&
    value % SIDEBAR_PAGE_SIZE === 0
  )
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  )
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isCount)
  )
}

function parseState(value: unknown): WorkspaceNavPersistedState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  const candidate = value as Record<string, unknown>
  if (
    candidate.version !== WORKSPACE_NAV_STORAGE_VERSION ||
    !isCount(candidate.projectsVisibleCount) ||
    !isCount(candidate.pinnedVisibleCount) ||
    !isCount(candidate.tasksVisibleCount) ||
    !isCountRecord(candidate.projectSessionVisibleCounts) ||
    !isBooleanRecord(candidate.projectOpen) ||
    typeof candidate.tasksOpen !== "boolean"
  ) {
    return null
  }
  return {
    version: WORKSPACE_NAV_STORAGE_VERSION,
    projectsVisibleCount: candidate.projectsVisibleCount,
    pinnedVisibleCount: candidate.pinnedVisibleCount,
    tasksVisibleCount: candidate.tasksVisibleCount,
    projectSessionVisibleCounts: { ...candidate.projectSessionVisibleCounts },
    projectOpen: { ...candidate.projectOpen },
    tasksOpen: candidate.tasksOpen,
  }
}

export function readWorkspaceNavState(
  storage?: Pick<Storage, "getItem">
): WorkspaceNavStateRead {
  const fallback = defaultWorkspaceNavState()
  let source = storage
  if (!source && typeof window !== "undefined") {
    try {
      source = window.localStorage
    } catch {
      return {
        state: fallback,
        error:
          "The saved sidebar state could not be read from browser storage.",
      }
    }
  }
  if (!source) return { state: fallback, error: null }

  let raw: string | null
  try {
    raw = source.getItem(WORKSPACE_NAV_STORAGE_KEY)
  } catch {
    return {
      state: fallback,
      error: "The saved sidebar state could not be read from browser storage.",
    }
  }
  if (raw === null) return { state: fallback, error: null }

  try {
    const state = parseState(JSON.parse(raw))
    return state
      ? { state, error: null }
      : {
          state: fallback,
          error: "The saved sidebar state is invalid and was reset.",
        }
  } catch {
    return {
      state: fallback,
      error: "The saved sidebar state is invalid and was reset.",
    }
  }
}

export function writeWorkspaceNavState(
  state: WorkspaceNavPersistedState,
  storage?: Pick<Storage, "setItem">
): WorkspaceNavStateWrite {
  let target = storage
  if (!target && typeof window !== "undefined") {
    try {
      target = window.localStorage
    } catch {
      return {
        error: "The sidebar state could not be saved to browser storage.",
      }
    }
  }
  if (!target) return { error: null }
  try {
    target.setItem(WORKSPACE_NAV_STORAGE_KEY, JSON.stringify(state))
    return { error: null }
  } catch {
    return { error: "The sidebar state could not be saved to browser storage." }
  }
}

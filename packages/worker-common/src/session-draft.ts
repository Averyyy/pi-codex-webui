import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from "node:fs"
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path"

import type { SessionManager } from "@earendil-works/pi-coding-agent"

type DraftSessionManager = Pick<
  SessionManager,
  | "getSessionFile"
  | "getHeader"
  | "getEntries"
  | "getLeafId"
  | "setSessionFile"
  | "branch"
  | "resetLeaf"
>

export interface DraftSessionPaths {
  /** The file selected by the SDK before the draft was redirected. */
  promotionTarget: string
  /** The file used by SessionManager while the draft is unclaimed. */
  privateSessionFile: string
  /** The explicit private root owned by this draft runtime. */
  draftDirectory: string
}

function isPathInside(parent: string, child: string) {
  const childRelative = relative(parent, child)
  return (
    childRelative === "" ||
    (!childRelative.startsWith("..") && !isAbsolute(childRelative))
  )
}

function writeExclusiveLines(path: string, lines: readonly unknown[]) {
  const fd = openSync(path, "wx")
  try {
    for (const line of lines) {
      writeFileSync(fd, `${JSON.stringify(line)}\n`)
    }
  } catch (error) {
    rmSync(path, { force: true })
    throw error
  } finally {
    closeSync(fd)
  }
}

function sessionFileLines(manager: DraftSessionManager) {
  const header = manager.getHeader()
  if (!header) throw new Error("Pi session has no session header.")
  return [header, ...manager.getEntries()]
}

/**
 * Redirect a newly-created SDK session to an explicit private file before the
 * AgentSessionRuntime is initialized. The manager's session directory remains
 * unchanged, so SDK /new and branch operations retain their normal destination.
 */
export function prepareDraftSession(
  manager: DraftSessionManager,
  draftDirectory: string
): DraftSessionPaths {
  const promotionTarget = manager.getSessionFile()
  if (!promotionTarget) {
    throw new Error("Pi did not assign a destination to the draft session.")
  }
  const header = manager.getHeader()
  if (!header) throw new Error("Pi draft session has no session header.")

  const resolvedTarget = resolve(promotionTarget)
  const resolvedDraftDirectory = resolve(draftDirectory)
  const privateSessionFile = join(
    resolvedDraftDirectory,
    basename(resolvedTarget)
  )
  if (isPathInside(dirname(resolvedTarget), privateSessionFile)) {
    throw new Error(
      "Pi draft session storage must be outside the normal session directory."
    )
  }

  mkdirSync(resolvedDraftDirectory, { recursive: true })
  writeExclusiveLines(privateSessionFile, [header])
  manager.setSessionFile(privateSessionFile)

  return {
    promotionTarget: resolvedTarget,
    privateSessionFile,
    draftDirectory: resolvedDraftDirectory,
  }
}

/**
 * Materialize a draft into the SDK-selected destination without using
 * exportToJsonl(), which would only serialize the active branch and could
 * rewrite the header. The existing manager and AgentSession remain attached.
 */
export function promoteDraftSession(
  manager: DraftSessionManager,
  draft: DraftSessionPaths,
  targetPath: string
) {
  const target = resolve(targetPath)
  if (target !== draft.promotionTarget) {
    throw new Error(
      "Draft promotion target does not match its SDK destination."
    )
  }

  const oldLeafId = manager.getLeafId()
  const privateSessionFile = manager.getSessionFile()
  if (privateSessionFile !== draft.privateSessionFile) {
    throw new Error("Pi draft session was redirected before promotion.")
  }

  writeExclusiveLines(target, sessionFileLines(manager))
  try {
    manager.setSessionFile(target)
    if (oldLeafId) manager.branch(oldLeafId)
    else manager.resetLeaf()
  } catch (error) {
    // Keep the manager usable if switching to the materialized file fails.
    manager.setSessionFile(draft.privateSessionFile)
    if (oldLeafId) manager.branch(oldLeafId)
    else manager.resetLeaf()
    rmSync(target, { force: true })
    throw error
  }
}

export function cleanupDraftSession(draft: DraftSessionPaths) {
  rmSync(draft.privateSessionFile, { force: true })
  rmSync(draft.draftDirectory, { recursive: true, force: true })
}

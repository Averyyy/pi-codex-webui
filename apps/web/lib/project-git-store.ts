"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import type { ProjectGitStatus } from "@/lib/project-git"
import {
  EMPTY_PROJECT_GIT_SNAPSHOT,
  getProjectGitStatusStore,
} from "@/lib/project-git-status-store"

export {
  EMPTY_PROJECT_GIT_SNAPSHOT,
  ProjectGitStatusStore,
  getProjectGitStatusStore,
} from "@/lib/project-git-status-store"
export type { ProjectGitSnapshot } from "@/lib/project-git-status-store"

const subscribeEmpty = () => () => {}
const getEmptySnapshot = () => EMPTY_PROJECT_GIT_SNAPSHOT

export function useProjectGitStatus(
  projectId: string | null,
  initialStatus: ProjectGitStatus | null = null
) {
  const [store] = useState(() =>
    projectId ? getProjectGitStatusStore(projectId, initialStatus) : null
  )
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.getSnapshot ?? getEmptySnapshot,
    getEmptySnapshot
  )
  useEffect(() => {
    if (!store) return
    store.retain()
    return () => store.release()
  }, [store])
  return {
    snapshot,
    refresh: store?.refresh ?? (() => Promise.resolve()),
  }
}

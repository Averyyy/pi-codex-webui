import { responseJson } from "@/lib/api-response"
import type { ProjectGitStatus } from "@/lib/project-git"

export interface ProjectGitSnapshot {
  status: ProjectGitStatus | null
  error: string | null
  loading: boolean
  changeSequence: number
  changedPath: string | null
}

export const EMPTY_PROJECT_GIT_SNAPSHOT: ProjectGitSnapshot = Object.freeze({
  status: null,
  error: null,
  loading: false,
  changeSequence: 0,
  changedPath: null,
})
const PROJECT_GIT_IDLE_GRACE_MS = 1_500
const stores = new Map<string, ProjectGitStatusStore>()

export class ProjectGitStatusStore {
  private snapshot: ProjectGitSnapshot
  private readonly listeners = new Set<() => void>()
  private source: EventSource | null = null
  private releaseTimer: ReturnType<typeof setTimeout> | null = null
  private requestSequence = 0
  private users = 0
  private activeRequest: AbortController | null = null

  constructor(
    readonly projectId: string,
    initialStatus: ProjectGitStatus | null = null,
    private readonly createEventSource: (url: string) => EventSource = (url) =>
      new EventSource(url)
  ) {
    this.snapshot = {
      ...EMPTY_PROJECT_GIT_SNAPSHOT,
      status: initialStatus,
    }
  }

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  seed(status: ProjectGitStatus | null) {
    if (!status || this.snapshot.status) return
    this.publish({ ...this.snapshot, status })
  }

  retain() {
    this.users++
    if (this.releaseTimer !== null) {
      clearTimeout(this.releaseTimer)
      this.releaseTimer = null
    }
    if (this.source) return

    for (const store of stores.values()) {
      if (store !== this) store.pauseTransport()
    }

    this.source = this.createEventSource(
      `/api/v1/projects/${encodeURIComponent(this.projectId)}/changes`
    )
    this.source.addEventListener("project.change", this.handleChange)
    void this.refresh()
  }

  release() {
    this.users = Math.max(0, this.users - 1)
    if (this.users || this.releaseTimer !== null) return
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null
      if (this.users) return
      this.source?.close()
      this.source = null
      this.activeRequest?.abort()
      this.activeRequest = null
      this.requestSequence++
      if (stores.get(this.projectId) === this) stores.delete(this.projectId)
    }, PROJECT_GIT_IDLE_GRACE_MS)
  }

  pauseTransport() {
    this.source?.close()
    this.source = null
    this.activeRequest?.abort()
    this.activeRequest = null
    this.requestSequence++
    if (this.snapshot.loading) {
      this.publish({ ...this.snapshot, loading: false })
    }
  }

  dispose() {
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer)
    this.releaseTimer = null
    this.pauseTransport()
    this.users = 0
    if (stores.get(this.projectId) === this) stores.delete(this.projectId)
  }

  refresh = async (changedPath: string | null = null) => {
    const sequence = ++this.requestSequence
    this.activeRequest?.abort()
    const request = new AbortController()
    this.activeRequest = request
    this.publish({
      ...this.snapshot,
      loading: this.snapshot.status === null,
      error: null,
    })
    try {
      const status = await responseJson<ProjectGitStatus>(
        await fetch(
          `/api/v1/projects/${encodeURIComponent(this.projectId)}/git`,
          { signal: request.signal, cache: "no-store" }
        )
      )
      if (sequence !== this.requestSequence) return
      this.publish({
        status,
        error: null,
        loading: false,
        changeSequence: this.snapshot.changeSequence + 1,
        changedPath,
      })
    } catch (error) {
      if (
        sequence !== this.requestSequence ||
        (error instanceof DOMException && error.name === "AbortError")
      )
        return
      this.publish({
        ...this.snapshot,
        error: error instanceof Error ? error.message : String(error),
        loading: false,
        changeSequence: this.snapshot.changeSequence + 1,
        changedPath,
      })
    } finally {
      if (sequence === this.requestSequence) this.activeRequest = null
    }
  }

  private handleChange = (source: Event) => {
    try {
      const value = JSON.parse((source as MessageEvent<string>).data) as {
        path?: unknown
      }
      if (
        typeof value !== "object" ||
        value === null ||
        !("path" in value) ||
        (value.path !== null && typeof value.path !== "string")
      ) {
        throw new Error("Project emitted an invalid change event.")
      }
      void this.refresh(value.path)
    } catch (error) {
      this.publish({
        ...this.snapshot,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private publish(snapshot: ProjectGitSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}

export function getProjectGitStatusStore(
  projectId: string,
  initialStatus: ProjectGitStatus | null = null,
  createEventSource?: (url: string) => EventSource
) {
  const existing = stores.get(projectId)
  if (existing) {
    existing.seed(initialStatus)
    return existing
  }
  const store = new ProjectGitStatusStore(
    projectId,
    initialStatus,
    createEventSource
  )
  stores.set(projectId, store)
  return store
}

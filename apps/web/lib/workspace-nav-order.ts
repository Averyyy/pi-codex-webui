export type WorkspaceNavOrderScope = "projects" | "tasks" | "pinned" | "project"

export interface WorkspaceNavOrderMutation {
  scope: WorkspaceNavOrderScope
  projectId?: string
  itemId: string
  targetId: string
  position: "before" | "after"
}

export type WorkspaceNavDragSource = Pick<
  WorkspaceNavOrderMutation,
  "scope" | "projectId" | "itemId"
> & { projectPinned?: boolean }

let activeWorkspaceNavDragSource: WorkspaceNavDragSource | null = null

export function setWorkspaceNavDragSource(source: WorkspaceNavDragSource) {
  activeWorkspaceNavDragSource = source
}

export function getWorkspaceNavDragSource() {
  return activeWorkspaceNavDragSource
}

export function clearWorkspaceNavDragSource() {
  activeWorkspaceNavDragSource = null
}

export function sameWorkspaceNavOrderScope(
  first: Pick<
    WorkspaceNavOrderMutation,
    "scope" | "projectId" | "itemId" | "targetId" | "position"
  > & {
    projectPinned?: boolean
  },
  second: Pick<
    WorkspaceNavOrderMutation,
    "scope" | "projectId" | "itemId" | "targetId" | "position"
  > & {
    projectPinned?: boolean
  }
) {
  return (
    first.scope === second.scope &&
    (first.scope !== "project" || first.projectId === second.projectId) &&
    (first.scope !== "projects" || first.projectPinned === second.projectPinned)
  )
}

export function moveWorkspaceNavItems<T extends { id: string }>(
  items: readonly T[],
  mutation: Pick<WorkspaceNavOrderMutation, "itemId" | "targetId" | "position">
) {
  const sourceIndex = items.findIndex((item) => item.id === mutation.itemId)
  const targetIndex = items.findIndex((item) => item.id === mutation.targetId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return [...items]
  }
  const next = [...items]
  const [source] = next.splice(sourceIndex, 1)
  if (!source) return [...items]
  const adjustedTargetIndex = next.findIndex(
    (item) => item.id === mutation.targetId
  )
  const insertionIndex =
    adjustedTargetIndex + (mutation.position === "after" ? 1 : 0)
  next.splice(insertionIndex, 0, source)
  return next
}

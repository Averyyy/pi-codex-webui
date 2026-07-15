import type { SessionTree } from "@workspace/runtime-protocol"

export type SessionTreeFilter = "default" | "user" | "labeled" | "all"

export interface SessionTreeRow {
  entry: SessionTree["entries"][number]
  depth: number
  parentId: string | null
  parentIndex: number | null
  active: boolean
  current: boolean
  childCount: number
  folded: boolean
}

const selectableEntryTypes = new Set([
  "branch_summary",
  "compaction",
  "custom_message",
  "message",
])

function isSelectableEntry(entry: SessionTree["entries"][number]) {
  return selectableEntryTypes.has(entry.type)
}

function activeEntryIds(
  tree: SessionTree,
  entriesById: Map<string, SessionTree["entries"][number]>
) {
  const ids = new Set<string>()
  let id = tree.leafId
  while (id !== null) {
    const entry = entriesById.get(id)
    if (!entry || ids.has(id)) break
    ids.add(id)
    id = entry.parentId
  }
  return ids
}

function matchesFilter(
  entry: SessionTree["entries"][number],
  filter: SessionTreeFilter
) {
  if (!isSelectableEntry(entry)) return false
  if (filter === "all") return true
  if (filter === "user") return entry.role === "user"
  if (filter === "labeled") return Boolean(entry.label)
  return true
}

function searchableText(entry: SessionTree["entries"][number]) {
  return [entry.label, entry.text, entry.role, entry.type]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
}

export function buildSessionTreeRows(
  tree: SessionTree,
  options: {
    filter: SessionTreeFilter
    query: string
    foldedIds: ReadonlySet<string>
  }
) {
  const entriesById = new Map(tree.entries.map((entry) => [entry.id, entry]))
  const entryOrder = new Map(
    tree.entries.map((entry, index) => [entry.id, index])
  )
  const activeIds = activeEntryIds(tree, entriesById)
  const currentEntryId = sessionTreeCurrentEntryId(tree)
  const tokens = options.query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const visibleEntries = tree.entries.filter(
    (entry) =>
      matchesFilter(entry, options.filter) &&
      tokens.every((token) => searchableText(entry).includes(token))
  )
  const visibleIds = new Set(visibleEntries.map((entry) => entry.id))

  function visibleParentId(entry: SessionTree["entries"][number]) {
    let parentId = entry.parentId
    const visited = new Set<string>()
    while (parentId !== null && !visibleIds.has(parentId)) {
      if (visited.has(parentId)) return null
      visited.add(parentId)
      parentId = entriesById.get(parentId)?.parentId ?? null
    }
    return parentId
  }

  const parents = new Map(
    visibleEntries.map((entry) => [entry.id, visibleParentId(entry)])
  )
  const children = new Map<string | null, SessionTree["entries"]>()
  for (const entry of visibleEntries) {
    const parentId = parents.get(entry.id) ?? null
    const siblings = children.get(parentId) ?? []
    siblings.push(entry)
    children.set(parentId, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => {
      const activeDifference =
        Number(activeIds.has(right.id)) - Number(activeIds.has(left.id))
      return (
        activeDifference || entryOrder.get(left.id)! - entryOrder.get(right.id)!
      )
    })
  }

  const rows: SessionTreeRow[] = []
  const rowIndexById = new Map<string, number>()
  const expandedForSearch = tokens.length > 0

  function visit(entry: SessionTree["entries"][number], depth: number) {
    const parentId = parents.get(entry.id) ?? null
    const childEntries = children.get(entry.id) ?? []
    const folded =
      childEntries.length > 1 &&
      !expandedForSearch &&
      options.foldedIds.has(entry.id)
    const row: SessionTreeRow = {
      entry,
      depth,
      parentId,
      parentIndex:
        parentId === null ? null : (rowIndexById.get(parentId) ?? null),
      active: activeIds.has(entry.id),
      current: entry.id === currentEntryId,
      childCount: childEntries.length,
      folded,
    }
    rowIndexById.set(entry.id, rows.length)
    rows.push(row)
    if (folded) return

    const childDepth = depth + Number(childEntries.length > 1)
    for (const child of childEntries) visit(child, childDepth)
  }

  for (const root of children.get(null) ?? []) visit(root, 0)
  return rows
}

export function sessionTreeActiveCount(tree: SessionTree) {
  const ids = activeEntryIds(
    tree,
    new Map(tree.entries.map((entry) => [entry.id, entry]))
  )
  return tree.entries.filter(
    (entry) => ids.has(entry.id) && isSelectableEntry(entry)
  ).length
}

export function sessionTreeEntryCount(tree: SessionTree) {
  return tree.entries.filter(isSelectableEntry).length
}

export function sessionTreeCurrentEntryId(tree: SessionTree) {
  const entriesById = new Map(tree.entries.map((entry) => [entry.id, entry]))
  const visited = new Set<string>()
  let entryId = tree.leafId
  while (entryId !== null) {
    if (visited.has(entryId)) return null
    visited.add(entryId)
    const entry = entriesById.get(entryId)
    if (!entry) return null
    if (isSelectableEntry(entry)) return entry.id
    entryId = entry.parentId
  }
  return null
}

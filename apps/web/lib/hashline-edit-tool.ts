export type HashlineEditToolKind = "replace" | "undo"

export interface HashlineEditRequest {
  index: number
  anchorRange?: string
  replacementLines?: number
}

export interface HashlineEditToolPresentation {
  kind: HashlineEditToolKind
  label: string
  preview: string
  path?: string
  requests: HashlineEditRequest[]
  facts: Array<{ label: string; value: string }>
  diff?: string
  undoSummary?: string
  classification?: "applied" | "noop"
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function string(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function classification(value: unknown) {
  return value === "applied" || value === "noop" ? value : undefined
}

function request(value: unknown, index: number): HashlineEditRequest | null {
  const item = record(value)
  if (!item) return null

  const range = Array.isArray(item.hash_range_inclusive)
    ? item.hash_range_inclusive.filter(
        (anchor): anchor is string => typeof anchor === "string"
      )
    : []
  const replacementLines = Array.isArray(item.content_lines)
    ? item.content_lines.length
    : undefined

  if (!range.length && replacementLines === undefined) return null
  return {
    index,
    ...(range.length === 2 ? { anchorRange: `${range[0]} → ${range[1]}` } : {}),
    ...(replacementLines === undefined ? {} : { replacementLines }),
  }
}

function requests(args: Record<string, unknown>) {
  if (Array.isArray(args.changes)) {
    return args.changes.flatMap((item, index) => {
      const parsed = request(item, index + 1)
      return parsed ? [parsed] : []
    })
  }
  const parsed = request(args, 1)
  return parsed ? [parsed] : []
}

export function hashlineEditToolKind(
  name: string,
  args: Record<string, unknown>
): HashlineEditToolKind | null {
  if (name === "undo_last_replace") return "undo"
  if (name !== "replace") return null

  const bulk = Array.isArray(args.changes)
  const flat =
    Array.isArray(args.hash_range_inclusive) &&
    Array.isArray(args.content_lines)
  return bulk || flat ? "replace" : null
}

export function hashlineEditToolPresentation(
  kind: HashlineEditToolKind,
  args: Record<string, unknown>,
  rawDetails?: unknown
): HashlineEditToolPresentation {
  const details = record(rawDetails) ?? {}
  const metrics = record(details.metrics) ?? {}
  const path = string(args.path)
  const parsedRequests = kind === "replace" ? requests(args) : []
  const facts: HashlineEditToolPresentation["facts"] = []
  const resultClassification =
    classification(metrics.classification) ??
    classification(details.classification)

  if (kind === "replace" && parsedRequests.length) {
    facts.push({ label: "请求", value: `${parsedRequests.length} 处` })
  }

  const editsAttempted = number(metrics.edits_attempted)
  const editsNoop = number(metrics.edits_noop)
  if (kind === "replace" && editsAttempted !== undefined) {
    facts.push({
      label: "应用",
      value:
        editsNoop === undefined
          ? `${editsAttempted} 处`
          : `${editsAttempted - editsNoop}/${editsAttempted} 处`,
    })
  }

  if (resultClassification) {
    facts.push({
      label: "结果",
      value: resultClassification === "applied" ? "已应用" : "无变更",
    })
  }

  const addedLines = number(metrics.added_lines)
  const removedLines = number(metrics.removed_lines)
  let undoSummary: string | undefined
  if (kind === "undo") {
    if (addedLines !== undefined || removedLines !== undefined) {
      const restored = addedLines ?? 0
      const removed = removedLines ?? 0
      facts.push({ label: "恢复", value: `${restored} 行` })
      facts.push({ label: "移除", value: `${removed} 行` })
      undoSummary = `恢复 ${restored} 行，移除 ${removed} 行`
    }
  } else if (addedLines !== undefined || removedLines !== undefined) {
    facts.push({
      label: "行数",
      value: `+${addedLines ?? 0} / −${removedLines ?? 0}`,
    })
  }

  const changedLines = record(metrics.changed_lines)
  const changedFirst = changedLines
    ? number(changedLines.first)
    : number(details.firstChangedLine)
  const changedLast = changedLines ? number(changedLines.last) : undefined
  if (kind === "replace" && changedFirst !== undefined) {
    facts.push({
      label: "范围",
      value:
        changedLast === undefined || changedLast === changedFirst
          ? `第 ${changedFirst} 行`
          : `第 ${changedFirst}–${changedLast} 行`,
    })
  }

  const warningCount = number(metrics.warnings)
  if (warningCount !== undefined && warningCount > 0) {
    facts.push({ label: "警告", value: `${warningCount} 条` })
  }

  const snapshotId = string(details.snapshotId)
  if (snapshotId) facts.push({ label: "快照", value: snapshotId })

  const diff = string(details.diff)
  return {
    kind,
    label: kind === "replace" ? "Hashline 替换" : "撤销 Hashline 替换",
    preview: path ?? "未提供文件路径",
    ...(path ? { path } : {}),
    requests: parsedRequests,
    facts,
    ...(diff ? { diff } : {}),
    ...(undoSummary ? { undoSummary } : {}),
    ...(resultClassification ? { classification: resultClassification } : {}),
  }
}

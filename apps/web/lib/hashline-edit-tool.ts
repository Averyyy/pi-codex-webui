import { createTranslator, type Locale } from "@/lib/i18n"

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
  rawDetails: unknown,
  locale: Locale
): HashlineEditToolPresentation {
  const t = createTranslator(locale)
  const details = record(rawDetails) ?? {}
  const metrics = record(details.metrics) ?? {}
  const path = string(args.path)
  const parsedRequests = kind === "replace" ? requests(args) : []
  const facts: HashlineEditToolPresentation["facts"] = []
  const resultClassification =
    classification(metrics.classification) ??
    classification(details.classification)

  if (kind === "replace" && parsedRequests.length) {
    facts.push({
      label: t("session.hashline.request"),
      value: t(
        parsedRequests.length === 1
          ? "session.hashline.requestCountOne"
          : "session.hashline.requestCount",
        { count: parsedRequests.length }
      ),
    })
  }

  const editsAttempted = number(metrics.edits_attempted)
  const editsNoop = number(metrics.edits_noop)
  if (kind === "replace" && editsAttempted !== undefined) {
    facts.push({
      label: t("session.hashline.apply"),
      value:
        editsNoop === undefined
          ? t(
              editsAttempted === 1
                ? "session.hashline.applyCountOne"
                : "session.hashline.applyCount",
              { count: editsAttempted }
            )
          : t(
              editsAttempted === 1
                ? "session.hashline.applyCountOne"
                : "session.hashline.applyCount",
              { count: `${editsAttempted - editsNoop}/${editsAttempted}` }
            ),
    })
  }

  if (resultClassification) {
    facts.push({
      label: t("session.hashline.result"),
      value:
        resultClassification === "applied"
          ? t("session.hashline.applied")
          : t("session.hashline.noChange"),
    })
  }

  const addedLines = number(metrics.added_lines)
  const removedLines = number(metrics.removed_lines)
  let undoSummary: string | undefined
  if (kind === "undo") {
    if (addedLines !== undefined || removedLines !== undefined) {
      const restored = addedLines ?? 0
      const removed = removedLines ?? 0
      facts.push({
        label: t("session.hashline.restore"),
        value: t(
          restored === 1
            ? "session.hashline.lineCountOne"
            : "session.hashline.lineCount",
          { count: restored }
        ),
      })
      facts.push({
        label: t("session.hashline.remove"),
        value: t(
          removed === 1
            ? "session.hashline.lineCountOne"
            : "session.hashline.lineCount",
          { count: removed }
        ),
      })
      undoSummary = t("session.hashline.undoSummary", { restored, removed })
    }
  } else if (addedLines !== undefined || removedLines !== undefined) {
    facts.push({
      label: t("session.hashline.lines"),
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
      label: t("session.hashline.range"),
      value:
        changedLast === undefined || changedLast === changedFirst
          ? t("session.hashline.line", { line: changedFirst })
          : t("session.hashline.lineRange", {
              first: changedFirst,
              last: changedLast,
            }),
    })
  }

  const warningCount = number(metrics.warnings)
  if (warningCount !== undefined && warningCount > 0) {
    facts.push({
      label: t("session.hashline.warning"),
      value: t(
        warningCount === 1
          ? "session.hashline.warningCountOne"
          : "session.hashline.warningCount",
        { count: warningCount }
      ),
    })
  }

  const snapshotId = string(details.snapshotId)
  if (snapshotId) {
    facts.push({ label: t("session.hashline.snapshot"), value: snapshotId })
  }

  const diff = string(details.diff)
  return {
    kind,
    label:
      kind === "replace"
        ? t("session.hashline.replace")
        : t("session.hashline.undo"),
    preview: path ?? t("session.hashline.noPath"),
    ...(path ? { path } : {}),
    requests: parsedRequests,
    facts,
    ...(diff ? { diff } : {}),
    ...(undoSummary ? { undoSummary } : {}),
    ...(resultClassification ? { classification: resultClassification } : {}),
  }
}

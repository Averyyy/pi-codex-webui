import { createTranslator, type Locale } from "@/lib/i18n"
import { parseProjectGitDiff } from "@/lib/project-git-display"

export type FileMutationToolKind = "write" | "edit" | "insert" | "replace"

export interface FileMutationPreview {
  mode: "diff" | "content"
  removed: string[]
  added: string[]
}

export interface FileMutationToolPresentation {
  kind: FileMutationToolKind
  label: string
  path: string
  patch?: string
  diff?: string
  additions?: number
  deletions?: number
  previews: FileMutationPreview[]
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function string(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function lines(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((line): line is string => typeof line === "string")
  }
  if (typeof value !== "string" || value.length === 0) return []
  const result = value.split(/\r?\n/)
  if (result.at(-1) === "") result.pop()
  return result
}

function editPreviews(args: Record<string, unknown>) {
  const inputs = Array.isArray(args.edits)
    ? args.edits
    : args.oldText !== undefined || args.newText !== undefined
      ? [args]
      : []
  return inputs.flatMap((value) => {
    const edit = record(value)
    if (!edit) return []
    const removed = lines(edit.oldText)
    const added = lines(edit.newText)
    return removed.length || added.length
      ? [{ mode: "diff" as const, removed, added }]
      : []
  })
}

function previews(
  kind: FileMutationToolKind,
  args: Record<string, unknown>
): FileMutationPreview[] {
  if (kind === "edit" || kind === "replace") return editPreviews(args)
  const added =
    kind === "write"
      ? lines(args.content)
      : lines(args.lines ?? args.content_lines ?? args.content)
  return added.length
    ? [{ mode: kind === "write" ? "content" : "diff", removed: [], added }]
    : []
}

function patchStats(patch: string) {
  let additions = 0
  let deletions = 0
  for (const line of parseProjectGitDiff([patch])) {
    if (line.kind === "addition") additions += 1
    else if (line.kind === "deletion") deletions += 1
  }
  return { additions, deletions }
}

export function fileMutationToolKind(
  name: string
): FileMutationToolKind | null {
  return name === "write" ||
    name === "edit" ||
    name === "insert" ||
    name === "replace"
    ? name
    : null
}

export function fileMutationToolPresentation(
  kind: FileMutationToolKind,
  args: Record<string, unknown>,
  rawDetails: unknown,
  locale: Locale
): FileMutationToolPresentation {
  const t = createTranslator(locale)
  const details = record(rawDetails) ?? {}
  const metrics = record(details.metrics) ?? {}
  const patch = string(details.patch)
  const diff = string(details.diff)
  const preview = previews(kind, args)
  const stats = patch
    ? patchStats(patch)
    : {
        additions:
          number(metrics.added_lines) ??
          (kind !== "write" && preview.length
            ? preview.reduce((total, item) => total + item.added.length, 0)
            : undefined),
        deletions:
          number(metrics.removed_lines) ??
          (preview.some((item) => item.removed.length)
            ? preview.reduce((total, item) => total + item.removed.length, 0)
            : undefined),
      }

  const labels = {
    write: "session.fileMutation.write",
    edit: "session.fileMutation.edit",
    insert: "session.fileMutation.insert",
    replace: "session.fileMutation.replace",
  } as const

  return {
    kind,
    label: t(labels[kind]),
    path:
      string(args.path) ??
      string(args.file_path) ??
      t("session.fileMutation.noPath"),
    ...(patch ? { patch } : {}),
    ...(!patch && diff ? { diff } : {}),
    ...(stats.additions === undefined ? {} : { additions: stats.additions }),
    ...(stats.deletions === undefined ? {} : { deletions: stats.deletions }),
    previews: preview,
  }
}

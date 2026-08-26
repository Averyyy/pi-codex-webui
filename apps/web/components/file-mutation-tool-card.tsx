"use client"

import { FilePenLineIcon, FilePlus2Icon, ListPlusIcon } from "lucide-react"

import { ConversationDisclosure } from "@/components/conversation-disclosure"
import { ConversationTextParts } from "@/components/conversation-text-parts"
import { GitDiffSurface } from "@/components/git-diff-surface"
import {
  fileMutationToolPresentation,
  type FileMutationPreview,
  type FileMutationToolKind,
} from "@/lib/file-mutation-tool"
import { translate, type Locale } from "@/lib/i18n"
import type { ToolResultView } from "@/lib/message-content"
import type { TranscriptPart } from "@/lib/session-types"

function PreviewRows({ previews }: { previews: FileMutationPreview[] }) {
  return (
    <div className="max-h-96 min-w-0 overflow-auto rounded-md border bg-muted/15">
      <table className="w-full border-collapse font-mono text-xs leading-5">
        <tbody>
          {previews.flatMap((preview, previewIndex) => {
            const removed = preview.removed.map((line, lineIndex) => (
              <tr
                key={`removed:${previewIndex}:${lineIndex}`}
                className="bg-red-500/10"
              >
                <td className="w-11 border-r px-2 text-right text-muted-foreground tabular-nums select-none">
                  {lineIndex + 1}
                </td>
                <td className="w-11 border-r" />
                <td className="min-w-0 px-2 align-top break-all whitespace-pre-wrap">
                  <span className="mr-2 text-red-700 select-none dark:text-red-300">
                    -
                  </span>
                  {line || "\u00a0"}
                </td>
              </tr>
            ))
            const added = preview.added.map((line, lineIndex) => (
              <tr
                key={`added:${previewIndex}:${lineIndex}`}
                className={
                  preview.mode === "diff" ? "bg-emerald-500/10" : undefined
                }
              >
                <td className="w-11 border-r" />
                <td className="w-11 border-r px-2 text-right text-muted-foreground tabular-nums select-none">
                  {lineIndex + 1}
                </td>
                <td className="min-w-0 px-2 align-top break-all whitespace-pre-wrap">
                  {preview.mode === "diff" ? (
                    <span className="mr-2 text-emerald-700 select-none dark:text-emerald-300">
                      +
                    </span>
                  ) : null}
                  {line || "\u00a0"}
                </td>
              </tr>
            ))
            return [...removed, ...added]
          })}
        </tbody>
      </table>
    </div>
  )
}

function CompactDiff({ value }: { value: string }) {
  return (
    <pre className="max-h-96 max-w-full overflow-auto rounded-md border bg-muted/15 py-2 font-mono text-xs leading-5">
      {value.split("\n").map((line, index) => (
        <span
          key={`${index}:${line}`}
          className={
            line.startsWith("+")
              ? "block min-w-max bg-emerald-500/10 px-3 text-emerald-800 dark:text-emerald-200"
              : line.startsWith("-")
                ? "block min-w-max bg-red-500/10 px-3 text-red-800 dark:text-red-200"
                : "block min-w-max px-3 text-muted-foreground"
          }
        >
          {line || " "}
        </span>
      ))}
    </pre>
  )
}

function icon(kind: FileMutationToolKind) {
  if (kind === "write") return <FilePlus2Icon />
  if (kind === "insert") return <ListPlusIcon />
  return <FilePenLineIcon />
}

export function FileMutationToolCard({
  kind,
  part,
  result,
  running,
  failed,
  locale,
}: {
  kind: FileMutationToolKind
  part: Extract<TranscriptPart, { type: "toolCall" }>
  result?: ToolResultView
  running: boolean
  failed: boolean
  locale: Locale
}) {
  const presentation = fileMutationToolPresentation(
    kind,
    part.arguments,
    result?.details,
    locale
  )
  const hasPreview = presentation.previews.length > 0

  return (
    <ConversationDisclosure
      label={<code className="font-mono text-xs">{presentation.label}</code>}
      preview={presentation.path}
      icon={icon(kind)}
      tone="write"
      meta={
        presentation.additions !== undefined ||
        presentation.deletions !== undefined ? (
          <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums">
            {presentation.additions !== undefined ? (
              <span className="text-emerald-700 dark:text-emerald-300">
                +{presentation.additions}
              </span>
            ) : null}
            {presentation.deletions !== undefined ? (
              <span className="text-red-700 dark:text-red-300">
                -{presentation.deletions}
              </span>
            ) : null}
          </span>
        ) : null
      }
      status={
        failed
          ? translate(locale, "session.transcript.failed")
          : running
            ? translate(locale, "session.transcript.running")
            : translate(locale, "session.transcript.complete")
      }
      statusTone={failed ? "destructive" : running ? "running" : "success"}
      ariaLabel={translate(locale, "session.tool.expand", {
        name: presentation.label,
      })}
      contentClassName="max-w-full"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {presentation.patch ? (
          <GitDiffSurface
            className="rounded-md border"
            diff={{
              path: presentation.path,
              originalPath: null,
              hunks: [presentation.patch],
            }}
          />
        ) : presentation.diff ? (
          <CompactDiff value={presentation.diff} />
        ) : hasPreview ? (
          <PreviewRows previews={presentation.previews} />
        ) : (
          <pre className="max-h-72 max-w-full overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5">
            {JSON.stringify(part.arguments, null, 2)}
          </pre>
        )}

        {failed && result ? (
          <section className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-destructive">
              {translate(locale, "session.tool.result")}
            </p>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <ConversationTextParts
                parts={result.parts}
                literal
                locale={locale}
              />
            </div>
          </section>
        ) : null}
      </div>
    </ConversationDisclosure>
  )
}

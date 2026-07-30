"use client"

import { FilePenLineIcon, Undo2Icon } from "lucide-react"

import { ConversationDisclosure } from "@/components/conversation-disclosure"
import { ConversationTextParts } from "@/components/conversation-text-parts"
import type {
  HashlineEditToolKind,
  HashlineEditToolPresentation,
} from "@/lib/hashline-edit-tool"
import { hashlineEditToolPresentation } from "@/lib/hashline-edit-tool"
import type { ToolResultView } from "@/lib/message-content"
import type { TranscriptPart } from "@/lib/session-types"

function Diff({ value }: { value: string }) {
  return (
    <pre className="max-h-96 max-w-full overflow-auto rounded-lg bg-muted/60 py-2 font-mono text-xs leading-5">
      {value.split("\n").map((line, index) => (
        <span
          key={`${index}:${line}`}
          className={
            line.startsWith("+")
              ? "block min-w-max bg-success/5 px-3 text-success"
              : line.startsWith("-")
                ? "block min-w-max bg-destructive/5 px-3 text-destructive"
                : "block min-w-max px-3 text-muted-foreground"
          }
        >
          {line || " "}
        </span>
      ))}
    </pre>
  )
}

function Requests({
  presentation,
}: {
  presentation: HashlineEditToolPresentation
}) {
  if (!presentation.requests.length) return null
  return (
    <section>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        计划变更
      </p>
      <ul className="grid min-w-0 gap-1.5 text-xs">
        {presentation.requests.map((request) => (
          <li
            key={request.index}
            className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2"
          >
            <span className="font-medium">变更 {request.index}</span>
            {request.anchorRange ? (
              <code className="min-w-0 break-all text-muted-foreground">
                {request.anchorRange}
              </code>
            ) : null}
            {request.replacementLines !== undefined ? (
              <span className="text-muted-foreground">
                写入 {request.replacementLines} 行
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function HashlineEditToolCard({
  kind,
  part,
  result,
  running,
  failed,
}: {
  kind: HashlineEditToolKind
  part: Extract<TranscriptPart, { type: "toolCall" }>
  result?: ToolResultView
  running: boolean
  failed: boolean
}) {
  const presentation = hashlineEditToolPresentation(
    kind,
    part.arguments,
    result?.details
  )
  const noChange = !running && presentation.classification === "noop"
  return (
    <ConversationDisclosure
      defaultOpen={failed}
      label={presentation.label}
      preview={presentation.preview}
      icon={kind === "replace" ? <FilePenLineIcon /> : <Undo2Icon />}
      tone="write"
      status={
        failed ? "失败" : running ? "运行中" : noChange ? "无变更" : "完成"
      }
      statusTone={
        failed
          ? "destructive"
          : running
            ? "running"
            : noChange
              ? "muted"
              : "success"
      }
      ariaLabel={`展开${presentation.label}详情`}
      contentClassName="max-w-full"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <Requests presentation={presentation} />
        {presentation.facts.length ? (
          <dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
            {presentation.facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 gap-1.5">
                <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
                <dd className="min-w-0 break-all">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {presentation.diff ? (
          <section className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              变更 Diff
            </p>
            <Diff value={presentation.diff} />
          </section>
        ) : null}
        {presentation.undoSummary ? (
          <section className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              撤销信息
            </p>
            <p className="mt-1">{presentation.undoSummary}</p>
          </section>
        ) : null}
        {result ? (
          <section className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {running ? "实时结果" : "结果"}
            </p>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <ConversationTextParts parts={result.parts} literal />
            </div>
          </section>
        ) : null}
      </div>
    </ConversationDisclosure>
  )
}

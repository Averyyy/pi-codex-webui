import {
  ChevronDownIcon,
  CircleAlertIcon,
  Settings2Icon,
  TerminalIcon,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

import { Markdown } from "@/components/markdown"
import { stripAnsi } from "@/lib/ansi"
import { formatTimestamp } from "@/lib/session-display"
import type {
  SessionSnapshot,
  TranscriptEntry,
  TranscriptPart,
} from "@/lib/session-types"

type MessageEntry = Extract<TranscriptEntry, { kind: "message" }>

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function toolSummary(name: string, args: Record<string, unknown>) {
  const field =
    name === "bash"
      ? args.command
      : ["read", "write", "edit", "find"].includes(name)
        ? args.path
        : name === "grep"
          ? args.pattern
          : undefined
  return typeof field === "string" ? field : ""
}

function ImagePart({
  part,
}: {
  part: Extract<TranscriptPart, { type: "image" }>
}) {
  return (
    // Session images are local data URLs with no stable dimensions for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:${part.mimeType};base64,${part.data}`}
      alt="Session attachment"
      className="max-h-[32rem] max-w-full rounded-xl border object-contain"
    />
  )
}

function TextParts({
  parts,
  literal = false,
}: {
  parts: TranscriptPart[]
  literal?: boolean
}) {
  return parts.map((part, index) => {
    if (part.type === "text") {
      return literal ? (
        <pre
          key={index}
          className="max-h-96 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap"
        >
          {stripAnsi(part.text)}
        </pre>
      ) : (
        <Markdown key={index}>{part.text}</Markdown>
      )
    }
    if (part.type === "thinking") {
      return (
        <details key={index} className="group rounded-lg border bg-muted/30">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            {part.redacted ? "已脱敏思考" : "思考"}
          </summary>
          <div className="border-t px-3 py-3 text-muted-foreground">
            <Markdown>{part.text}</Markdown>
          </div>
        </details>
      )
    }
    if (part.type === "image") return <ImagePart key={index} part={part} />
    if (part.type === "unsupported") {
      return (
        <div key={index} className="rounded-lg border border-dashed p-3">
          <p className="mb-2 text-xs font-medium">
            未支持的 content part：{part.partType}
          </p>
          <pre className="overflow-x-auto text-xs">{json(part.value)}</pre>
        </div>
      )
    }
    return null
  })
}

function ToolCallCard({
  part,
  result,
}: {
  part: Extract<TranscriptPart, { type: "toolCall" }>
  result?: MessageEntry
}) {
  const summary = toolSummary(part.name, part.arguments)
  return (
    <Collapsible
      defaultOpen={result?.isError === true}
      className="min-w-0 rounded-xl border"
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        <TerminalIcon className="size-4 shrink-0" />
        <span className="font-mono text-xs font-medium">{part.name}</span>
        {summary ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {summary}
          </span>
        ) : null}
        {result?.isError ? (
          <Badge variant="destructive" className="ml-auto shrink-0">
            error
          </Badge>
        ) : result ? (
          <Badge variant="secondary" className="ml-auto shrink-0">
            done
          </Badge>
        ) : null}
        <CollapsibleTrigger
          className={buttonVariants({
            variant: "ghost",
            size: "icon-sm",
            className:
              "ml-auto shrink-0 data-open:bg-muted [&_svg]:transition-transform data-open:[&_svg]:rotate-180",
          })}
          aria-label={`查看 ${part.name} 详情`}
        >
          <ChevronDownIcon />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="border-t">
        <div className="grid gap-4 p-3">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              参数
            </p>
            <pre className="max-h-80 max-w-full overflow-auto rounded-lg bg-muted p-3 font-mono text-xs leading-5">
              {json(part.arguments)}
            </pre>
          </div>
          {result ? (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                结果
              </p>
              <div className="grid gap-3 text-sm">
                <TextParts parts={result.parts} literal />
              </div>
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Message({
  entry,
  toolResults,
}: {
  entry: MessageEntry
  toolResults: Map<string, MessageEntry>
}) {
  if (entry.role === "bashExecution") {
    const [command, output] = entry.parts
    return (
      <div id={`entry-${entry.id}`} className="rounded-xl border">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <TerminalIcon className="size-4" />
          <span className="font-mono text-xs">shell</span>
          {entry.isError ? (
            <Badge variant="destructive" className="ml-auto">
              error
            </Badge>
          ) : null}
        </div>
        <pre className="overflow-x-auto bg-muted/50 p-3 text-xs leading-5">
          $ {command?.type === "text" ? stripAnsi(command.text) : ""}
          {"\n"}
          {output?.type === "text" ? stripAnsi(output.text) : ""}
        </pre>
      </div>
    )
  }

  const user = entry.role === "user"
  const assistant = entry.role === "assistant"
  return (
    <article
      id={`entry-${entry.id}`}
      className={
        user
          ? "ml-auto max-w-[85%] min-w-0 rounded-2xl bg-muted px-4 py-3"
          : "grid min-w-0 gap-3"
      }
    >
      {!user ? (
        <div className="flex items-center gap-2 text-xs font-medium">
          <span>{assistant ? "Pi" : entry.role}</span>
          <span className="font-normal text-muted-foreground">
            {formatTimestamp(entry.timestamp)}
          </span>
        </div>
      ) : null}
      <div className="grid min-w-0 gap-3">
        {entry.parts.map((part, index) =>
          part.type === "toolCall" ? (
            <ToolCallCard
              key={part.id}
              part={part}
              result={toolResults.get(part.id)}
            />
          ) : (
            <TextParts
              key={index}
              parts={[part]}
              literal={entry.role === "toolResult"}
            />
          )
        )}
      </div>
    </article>
  )
}

function Event({
  entry,
}: {
  entry: Extract<TranscriptEntry, { kind: "event" }>
}) {
  const summary =
    entry.eventType === "compaction" || entry.eventType === "branch_summary"
  if (summary) {
    return (
      <details
        id={`entry-${entry.id}`}
        className="rounded-xl border bg-muted/30"
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          {entry.title}
        </summary>
        <div className="border-t px-4 py-4 text-sm text-muted-foreground">
          <Markdown>{entry.text ?? ""}</Markdown>
        </div>
      </details>
    )
  }
  if (entry.value !== undefined) {
    return (
      <div
        id={`entry-${entry.id}`}
        className="rounded-xl border border-dashed p-3"
      >
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <CircleAlertIcon className="size-4" />
          {entry.title}
        </div>
        <pre className="overflow-x-auto text-xs">{json(entry.value)}</pre>
      </div>
    )
  }
  return (
    <div
      id={`entry-${entry.id}`}
      className="flex items-center justify-center gap-2 text-xs text-muted-foreground"
    >
      <span>{entry.title}</span>
      {entry.text ? <code>{stripAnsi(entry.text)}</code> : null}
    </div>
  )
}

type SettingEvent = Extract<TranscriptEntry, { kind: "event" }>

function isSettingEvent(entry: TranscriptEntry): entry is SettingEvent {
  return (
    entry.kind === "event" &&
    (entry.eventType === "model_change" ||
      entry.eventType === "thinking_level_change")
  )
}

function SettingChanges({ entries }: { entries: SettingEvent[] }) {
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-md px-1 py-1 hover:text-foreground [&::-webkit-details-marker]:hidden">
        <Settings2Icon className="size-3.5" />
        <span>会话设置变更</span>
        <span className="tabular-nums">{entries.length}</span>
        <ChevronDownIcon className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 ml-2 grid gap-2 border-l pl-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            id={`entry-${entry.id}`}
            className="flex min-w-0 items-baseline gap-2"
          >
            <span className="shrink-0">{entry.title}</span>
            {entry.text ? (
              <code className="min-w-0 truncate">{stripAnsi(entry.text)}</code>
            ) : null}
          </div>
        ))}
      </div>
    </details>
  )
}

function transcriptBlocks(entries: TranscriptEntry[]) {
  const blocks: (TranscriptEntry | SettingEvent[])[] = []
  let settingEvents: SettingEvent[] = []
  const flush = () => {
    if (!settingEvents.length) return
    blocks.push(settingEvents)
    settingEvents = []
  }
  for (const entry of entries) {
    if (isSettingEvent(entry)) {
      settingEvents.push(entry)
    } else {
      flush()
      blocks.push(entry)
    }
  }
  flush()
  return blocks
}

export function SessionTranscript({ snapshot }: { snapshot: SessionSnapshot }) {
  const toolResults = new Map<string, MessageEntry>()
  const renderedToolResults = new Set<string>()
  for (const entry of snapshot.entries) {
    if (
      entry.kind === "message" &&
      entry.role === "toolResult" &&
      entry.toolCallId
    ) {
      toolResults.set(entry.toolCallId, entry)
    }
    if (entry.kind === "message") {
      for (const part of entry.parts) {
        if (part.type === "toolCall") renderedToolResults.add(part.id)
      }
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      {transcriptBlocks(snapshot.entries).map((block) => {
        if (Array.isArray(block)) {
          return <SettingChanges key={block[0]?.id} entries={block} />
        }
        const entry = block
        if (
          entry.kind === "message" &&
          entry.role === "toolResult" &&
          entry.toolCallId &&
          renderedToolResults.has(entry.toolCallId)
        ) {
          return null
        }
        return entry.kind === "message" ? (
          <Message key={entry.id} entry={entry} toolResults={toolResults} />
        ) : (
          <Event key={entry.id} entry={entry} />
        )
      })}
    </div>
  )
}

import {
  BrainIcon,
  CircleAlertIcon,
  FileTextIcon,
  Settings2Icon,
  TerminalIcon,
} from "lucide-react"

import { ConversationDisclosure } from "@/components/conversation-disclosure"
import { Markdown } from "@/components/markdown"
import { stripAnsi } from "@/lib/ansi"
import { formatInlinePreview, formatTimestamp } from "@/lib/session-display"
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
  let field: unknown
  switch (name) {
    case "bash":
      field = args.command
      break
    case "Agent":
      field = args.description
      break
    case "read":
    case "write":
    case "edit":
    case "find":
      field = args.path
      break
    case "grep":
      field = args.pattern
      break
  }
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
        <ConversationDisclosure
          key={index}
          label={part.redacted ? "已脱敏思考" : "思考"}
          preview={formatInlinePreview(part.text)}
          icon={<BrainIcon />}
          ariaLabel={part.redacted ? "展开已脱敏思考" : "展开思考"}
          contentClassName="max-h-80 overflow-y-auto pr-2 text-xs text-muted-foreground [&_p]:leading-5"
        >
          <Markdown>{part.text}</Markdown>
        </ConversationDisclosure>
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
    <ConversationDisclosure
      defaultOpen={result?.isError === true}
      label={<code className="font-mono text-xs">{part.name}</code>}
      preview={summary}
      icon={<TerminalIcon />}
      status={result?.isError ? "失败" : result ? "完成" : "运行中"}
      statusTone={result?.isError ? "destructive" : "muted"}
      ariaLabel={`展开 ${part.name} 详情`}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <section>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            参数
          </p>
          <pre className="max-h-72 max-w-full overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-5">
            {json(part.arguments)}
          </pre>
        </section>
        {result ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              结果
            </p>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <TextParts parts={result.parts} literal />
            </div>
          </div>
        ) : null}
      </div>
    </ConversationDisclosure>
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
    const commandText =
      command?.type === "text" ? formatInlinePreview(command.text) : ""
    return (
      <div id={`entry-${entry.id}`}>
        <ConversationDisclosure
          defaultOpen={entry.isError === true}
          label={<code className="font-mono text-xs">shell</code>}
          preview={commandText}
          icon={<TerminalIcon />}
          status={entry.isError ? "失败" : "完成"}
          statusTone={entry.isError ? "destructive" : "muted"}
          ariaLabel="展开 shell 详情"
        >
          <pre className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
            $ {command?.type === "text" ? stripAnsi(command.text) : ""}
            {"\n"}
            {output?.type === "text" ? stripAnsi(output.text) : ""}
          </pre>
        </ConversationDisclosure>
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
          ? "ml-auto max-w-[88%] min-w-0 rounded-2xl bg-muted px-3.5 py-2.5"
          : "flex min-w-0 flex-col gap-2"
      }
    >
      {!user && !assistant ? (
        <div className="flex items-center gap-2 text-xs font-medium">
          <span>{entry.role}</span>
          <span className="font-normal text-muted-foreground">
            {formatTimestamp(entry.timestamp)}
          </span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
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
      <div id={`entry-${entry.id}`}>
        <ConversationDisclosure
          label={entry.title}
          preview={entry.text ? formatInlinePreview(entry.text) : undefined}
          icon={<FileTextIcon />}
          ariaLabel={`展开${entry.title}`}
          contentClassName="text-sm text-muted-foreground"
        >
          <Markdown>{entry.text ?? ""}</Markdown>
        </ConversationDisclosure>
      </div>
    )
  }
  if (entry.value !== undefined) {
    return (
      <div id={`entry-${entry.id}`}>
        <ConversationDisclosure
          label={entry.title}
          preview={formatInlinePreview(json(entry.value))}
          icon={<CircleAlertIcon />}
          ariaLabel={`展开${entry.title}`}
        >
          <pre className="max-h-72 overflow-auto rounded-lg bg-muted/60 p-3 text-xs">
            {json(entry.value)}
          </pre>
        </ConversationDisclosure>
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
    <ConversationDisclosure
      label="会话设置变更"
      preview={`${entries.length} 项`}
      icon={<Settings2Icon />}
      ariaLabel="展开会话设置变更"
      contentClassName="text-xs text-muted-foreground"
    >
      <div className="flex flex-col gap-2">
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
    </ConversationDisclosure>
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
    <div className="flex min-w-0 flex-col gap-5">
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

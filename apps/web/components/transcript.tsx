"use client"

import {
  CircleAlertIcon,
  FileTextIcon,
  Settings2Icon,
  TerminalIcon,
} from "lucide-react"
import type { RuntimeStatus } from "@workspace/runtime-protocol"

import { ConversationDisclosure } from "@/components/conversation-disclosure"
import { ConversationMessageParts } from "@/components/conversation-message-parts"
import { Markdown } from "@/components/markdown"
import { useStreamingRuntimeStatus } from "@/components/session-streaming-context"
import { UserMessage } from "@/components/user-message"
import { WebUiMessageFallback } from "@/components/webui-message-fallback"
import { stripAnsi } from "@/lib/ansi"
import { createTranslator, type Locale, type Translator } from "@/lib/i18n"
import type { ToolResultView } from "@/lib/message-content"
import { formatInlinePreview, formatTimestamp } from "@/lib/session-display"
import type {
  SessionSnapshot,
  TranscriptEntry,
  TranscriptPart,
} from "@/lib/session-types"

type MessageEntry = Extract<TranscriptEntry, { kind: "message" }>
const TRANSCRIPT_ITEM_CLASS =
  "[content-visibility:auto] [contain-intrinsic-size:auto_5rem]"

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function Message({
  entry,
  parts = entry.parts,
  displayId = entry.id,
  toolResults,
  sessionId,
  mutationToken,
  workspaceUnavailable,
  initialRuntimeStatus,
  locale,
  t,
}: {
  entry: MessageEntry
  parts?: TranscriptPart[]
  displayId?: string
  toolResults: ReadonlyMap<string, ToolResultView>
  sessionId: string
  mutationToken: string
  workspaceUnavailable: boolean
  initialRuntimeStatus: RuntimeStatus
  locale: Locale
  t: Translator
}) {
  if (parts.length === 0) return null
  if (entry.role === "bashExecution") {
    const [command, output] = parts
    const commandText =
      command?.type === "text" ? formatInlinePreview(command.text) : ""
    return (
      <div id={`entry-${displayId}`} className={TRANSCRIPT_ITEM_CLASS}>
        <ConversationDisclosure
          defaultOpen={entry.isError === true}
          label={<code className="font-mono text-xs">shell</code>}
          preview={commandText}
          icon={<TerminalIcon />}
          tone="execute"
          status={
            entry.isError
              ? t("session.transcript.failed")
              : t("session.transcript.complete")
          }
          statusTone={entry.isError ? "destructive" : "success"}
          ariaLabel={t("session.transcript.expandShell")}
        >
          <pre className="max-h-72 overflow-auto rounded-lg border bg-terminal p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-terminal-foreground">
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
  const content = (
    <ConversationMessageParts
      parts={parts}
      literal={entry.role === "toolResult"}
      toolResults={toolResults}
      locale={locale}
    />
  )

  if (user) {
    return (
      <UserMessage
        entry={entry}
        sessionId={sessionId}
        mutationToken={mutationToken}
        workspaceUnavailable={workspaceUnavailable}
        initialRuntimeStatus={initialRuntimeStatus}
      >
        {content}
      </UserMessage>
    )
  }

  return (
    <article
      id={`entry-${displayId}`}
      className={`flex min-w-0 flex-col gap-2 ${TRANSCRIPT_ITEM_CLASS}`}
    >
      {!assistant ? (
        <div className="flex items-center gap-2 text-xs font-medium">
          <span>{entry.role}</span>
          <span className="font-normal text-muted-foreground">
            {formatTimestamp(entry.timestamp, locale)}
          </span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">{content}</div>
    </article>
  )
}

function Event({
  entry,
  t,
}: {
  entry: Extract<TranscriptEntry, { kind: "event" }>
  t: Translator
}) {
  const summary =
    entry.eventType === "compaction" || entry.eventType === "branch_summary"
  if (summary) {
    return (
      <div id={`entry-${entry.id}`} className={TRANSCRIPT_ITEM_CLASS}>
        <ConversationDisclosure
          label={entry.title}
          preview={entry.text ? formatInlinePreview(entry.text) : undefined}
          icon={<FileTextIcon />}
          tone="read"
          ariaLabel={t("session.tool.expand", { name: entry.title })}
          contentClassName="text-sm text-muted-foreground"
        >
          <Markdown>{entry.text ?? ""}</Markdown>
        </ConversationDisclosure>
      </div>
    )
  }
  if (entry.value !== undefined) {
    return (
      <div id={`entry-${entry.id}`} className={TRANSCRIPT_ITEM_CLASS}>
        <ConversationDisclosure
          label={entry.title}
          preview={formatInlinePreview(json(entry.value))}
          icon={<CircleAlertIcon />}
          ariaLabel={t("session.tool.expand", { name: entry.title })}
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
      className={`flex items-center justify-center gap-2 text-xs text-muted-foreground ${TRANSCRIPT_ITEM_CLASS}`}
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

function SettingChanges({
  entries,
  t,
}: {
  entries: SettingEvent[]
  t: Translator
}) {
  return (
    <ConversationDisclosure
      className={TRANSCRIPT_ITEM_CLASS}
      label={t("session.transcript.settingsChanges")}
      preview={t(
        entries.length === 1
          ? "session.transcript.settingsCountOne"
          : "session.transcript.settingsCount",
        { count: entries.length }
      )}
      icon={<Settings2Icon />}
      ariaLabel={t("session.transcript.expandSettings")}
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

function isFinalOutputPart(part: TranscriptPart) {
  return part.type !== "thinking" && part.type !== "toolCall"
}

function isFinalAssistantMessage(
  entry: TranscriptEntry
): entry is MessageEntry {
  return (
    entry.kind === "message" &&
    entry.role === "assistant" &&
    entry.parts.some(isFinalOutputPart)
  )
}

function transcriptRounds(entries: TranscriptEntry[]) {
  const rounds: TranscriptEntry[][] = []
  let current: TranscriptEntry[] = []
  for (const entry of entries) {
    if (entry.kind === "message" && entry.role === "user" && current.length) {
      rounds.push(current)
      current = []
    }
    current.push(entry)
  }
  if (current.length) rounds.push(current)
  return rounds
}

function elapsedDuration(entries: TranscriptEntry[]) {
  const timestamps = entries
    .map((entry) => Date.parse(entry.timestamp))
    .filter((timestamp) => Number.isFinite(timestamp))
  if (timestamps.length < 2) return null
  const seconds = Math.max(
    0,
    Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / 1_000)
  )
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function ProcessDisclosure({
  entries,
  active,
  t,
  children,
}: {
  entries: TranscriptEntry[]
  active: boolean
  t: Translator
  children: React.ReactNode
}) {
  if (!entries.length) return null
  const preview = entries
    .flatMap((entry) => {
      if (entry.kind === "event") return entry.text ? [entry.text] : []
      return entry.parts.flatMap((part) =>
        part.type === "text" ? [part.text] : []
      )
    })
    .map((value) => formatInlinePreview(value))
    .find(Boolean)

  const duration = elapsedDuration(entries)

  return (
    <ConversationDisclosure
      label={
        !active && duration
          ? t("session.transcript.elapsed", { duration })
          : t("session.transcript.process")
      }
      preview={preview}
      icon={<TerminalIcon />}
      tone="execute"
      status={
        active
          ? t("session.transcript.running")
          : t("session.transcript.complete")
      }
      statusTone={active ? "running" : "success"}
      ariaLabel={t("session.transcript.expandProcess")}
      className={TRANSCRIPT_ITEM_CLASS}
      contentClassName="flex min-w-0 flex-col gap-5"
    >
      {children}
    </ConversationDisclosure>
  )
}

export function SessionTranscript({
  snapshot,
  sessionId,
  mutationToken,
  workspaceUnavailable,
  initialRuntimeStatus,
  locale,
}: {
  snapshot: SessionSnapshot
  sessionId: string
  mutationToken: string
  workspaceUnavailable: boolean
  initialRuntimeStatus: RuntimeStatus
  locale: Locale
}) {
  const t = createTranslator(locale)
  const liveRuntimeStatus = useStreamingRuntimeStatus()
  const toolResults = new Map<string, ToolResultView>()
  const renderedToolResults = new Set<string>()
  for (const entry of snapshot.entries) {
    if (
      entry.kind === "message" &&
      entry.role === "toolResult" &&
      entry.toolCallId
    ) {
      toolResults.set(entry.toolCallId, {
        entryId: entry.id,
        parts: entry.parts,
        details: entry.details,
        isError: entry.isError,
      })
    }
    if (entry.kind === "message") {
      for (const part of entry.parts) {
        if (part.type === "toolCall") renderedToolResults.add(part.id)
      }
    }
  }

  const rounds = transcriptRounds(snapshot.entries)
  const renderEntry = (
    entry: TranscriptEntry,
    options: { parts?: TranscriptPart[]; displayId?: string } = {}
  ) => {
    if (
      entry.kind === "message" &&
      entry.role === "toolResult" &&
      entry.toolCallId &&
      renderedToolResults.has(entry.toolCallId)
    ) {
      return null
    }
    if (entry.kind !== "message") {
      return <Event key={entry.id} entry={entry} t={t} />
    }
    const message = (
      <Message
        key={`${entry.id}:${options.displayId ?? "full"}`}
        entry={entry}
        parts={options.parts}
        displayId={options.displayId}
        toolResults={toolResults}
        sessionId={sessionId}
        mutationToken={mutationToken}
        workspaceUnavailable={workspaceUnavailable}
        initialRuntimeStatus={initialRuntimeStatus}
        locale={locale}
        t={t}
      />
    )
    return entry.role.startsWith("custom:") ? (
      <WebUiMessageFallback key={`${entry.id}:fallback`} entryId={entry.id}>
        {message}
      </WebUiMessageFallback>
    ) : (
      message
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {rounds.map((round, roundIndex) => {
        const userIndex = round.findIndex(
          (entry) => entry.kind === "message" && entry.role === "user"
        )
        const user = userIndex >= 0 ? round[userIndex] : undefined
        const content = userIndex >= 0 ? round.slice(userIndex + 1) : round
        let finalIndex = -1
        for (let index = content.length - 1; index >= 0; index -= 1) {
          if (isFinalAssistantMessage(content[index]!)) {
            finalIndex = index
            break
          }
        }
        const finalEntry: MessageEntry | undefined =
          finalIndex >= 0 && isFinalAssistantMessage(content[finalIndex]!)
            ? (content[finalIndex] as MessageEntry)
            : undefined
        const processEntries: TranscriptEntry[] = []
        const trailingEntries: TranscriptEntry[] = []
        for (const [index, entry] of content.entries()) {
          if (index === finalIndex && entry.kind === "message") {
            const finalPartIndex = entry.parts.findIndex(isFinalOutputPart)
            const processParts = entry.parts.slice(0, finalPartIndex)
            if (processParts.length) {
              processEntries.push({
                ...entry,
                id: `${entry.id}:process`,
                parts: processParts,
              })
            }
            continue
          }
          if (finalIndex >= 0 && index > finalIndex) {
            trailingEntries.push(entry)
            continue
          }
          if (entry.kind !== "message") {
            processEntries.push(entry)
            continue
          }
          if (entry.parts.length) processEntries.push(entry)
        }

        const roundEntries = [
          ...round.slice(0, Math.max(0, userIndex)),
          ...(user ? [user] : []),
        ]
        const finalPartIndex =
          finalEntry?.parts.findIndex(isFinalOutputPart) ?? -1
        const finalParts =
          finalEntry && finalPartIndex >= 0
            ? finalEntry.parts.slice(finalPartIndex)
            : []
        const runtimeStatus = liveRuntimeStatus ?? initialRuntimeStatus
        const active =
          (runtimeStatus === "starting" ||
            runtimeStatus === "busy" ||
            runtimeStatus === "stopping") &&
          roundIndex === rounds.length - 1

        return (
          <div
            key={round[0]?.id ?? `round-${roundIndex}`}
            className="flex min-w-0 flex-col gap-5"
          >
            {roundEntries.map((entry) => renderEntry(entry))}
            {processEntries.length ? (
              <ProcessDisclosure entries={processEntries} active={active} t={t}>
                {transcriptBlocks(processEntries).map((block) =>
                  Array.isArray(block) ? (
                    <SettingChanges key={block[0]?.id} entries={block} t={t} />
                  ) : (
                    renderEntry(block)
                  )
                )}
              </ProcessDisclosure>
            ) : null}
            {finalEntry && finalParts.length
              ? renderEntry(finalEntry, { parts: finalParts })
              : null}
            {trailingEntries.map((entry) => renderEntry(entry))}
          </div>
        )
      })}
    </div>
  )
}

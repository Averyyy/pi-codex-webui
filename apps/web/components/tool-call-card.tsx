"use client"

import { useDeferredValue } from "react"
import {
  BotIcon,
  BracesIcon,
  FileDownIcon,
  FilePenLineIcon,
  FileSearchIcon,
  FileTextIcon,
  FolderSearchIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
} from "lucide-react"

import {
  ConversationDisclosure,
  ConversationAnchorContext,
  type ConversationDisclosureTone,
} from "@/components/conversation-disclosure"
import { ConversationTextParts } from "@/components/conversation-text-parts"
import { FileMutationToolCard } from "@/components/file-mutation-tool-card"
import { HashlineEditToolCard } from "@/components/hashline-edit-tool-card"
import {
  useStreamingTool,
  useStreamingRuntimeStatus,
} from "@/components/session-streaming-context"
import { toolCallStatus } from "@/lib/tool-call-status"
import { fileMutationToolKind } from "@/lib/file-mutation-tool"
import {
  codemodeCalls,
  codemodeSource,
  mcpToolLabel,
} from "@/lib/codemode-tool"
import { hashlineEditToolKind } from "@/lib/hashline-edit-tool"
import { translate, type Locale } from "@/lib/i18n"
import type { ToolResultView } from "@/lib/message-content"
import type { TranscriptPart } from "@/lib/session-types"
import {
  isShellToolName,
  parseShellToolResult,
  shellToolCommand,
} from "@/lib/shell-tool-result"
import {
  isWebAccessToolName,
  webAccessToolPresentation,
  type WebAccessToolName,
} from "@/lib/web-access-tool"

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function toolSummary(name: string, args: Record<string, unknown>) {
  const shellCommand = shellToolCommand(name, args)
  if (shellCommand) return shellCommand
  let field: unknown
  switch (name) {
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
    case "codemode":
      field = codemodeSource(args)?.split("\n", 1)[0]
      break
  }
  return typeof field === "string" ? field : ""
}

function toolAppearance(name: string): {
  icon: React.ReactNode
  tone: ConversationDisclosureTone
} {
  switch (name) {
    case "bash":
    case "exec_command":
    case "shell":
      return { icon: <TerminalIcon />, tone: "execute" }
    case "Agent":
      return { icon: <BotIcon />, tone: "agent" }
    case "codemode":
      return { icon: <BracesIcon />, tone: "execute" }
    case "read":
      return { icon: <FileTextIcon />, tone: "read" }
    case "write":
    case "edit":
      return { icon: <FilePenLineIcon />, tone: "write" }
    case "find":
      return { icon: <FolderSearchIcon />, tone: "read" }
    case "grep":
      return { icon: <SearchIcon />, tone: "read" }
    default:
      return { icon: <WrenchIcon />, tone: "neutral" }
  }
}

function CodemodeToolCard({
  part,
  result,
  running,
  failed,
  incomplete,
  locale,
}: {
  part: Extract<TranscriptPart, { type: "toolCall" }>
  result?: ToolResultView
  running: boolean
  failed: boolean
  incomplete: boolean
  locale: Locale
}) {
  const calls = codemodeCalls(result?.details)
  const status = (callStatus: (typeof calls)[number]["status"]) =>
    translate(
      locale,
      callStatus === "running"
        ? "session.tool.callRunning"
        : callStatus === "ok"
          ? "session.tool.callComplete"
          : callStatus === "error"
            ? "session.tool.callFailed"
            : "session.tool.callCancelled"
    )
  const code = codemodeSource(part.arguments)
  return (
    <ConversationDisclosure
      defaultOpen={false}
      label={<code className="font-mono text-xs">codemode</code>}
      preview={toolSummary("codemode", part.arguments)}
      icon={<BracesIcon />}
      tone="execute"
      status={
        failed
          ? translate(locale, "session.transcript.failed")
          : running
            ? translate(locale, "session.transcript.running")
            : translate(
                locale,
                incomplete
                  ? "session.transcript.incomplete"
                  : "session.transcript.complete"
              )
      }
      statusTone={
        failed
          ? "destructive"
          : running
            ? "running"
            : incomplete
              ? "muted"
              : "success"
      }
      ariaLabel={translate(locale, "session.tool.expand", { name: "codemode" })}
    >
      <div className="flex min-w-0 flex-col gap-3">
        {code !== undefined ? (
          <section className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {translate(locale, "session.tool.script")}
            </p>
            <pre className="max-h-96 max-w-full overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-5">
              <code>{code}</code>
            </pre>
          </section>
        ) : null}
        {calls.length ? (
          <section className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {translate(locale, "session.tool.nestedCalls")}
            </p>
            <ul className="flex min-w-0 flex-col gap-2">
              {calls.map((call) => (
                <li
                  key={call.id}
                  className="min-w-0 rounded-lg bg-muted/50 p-3 text-xs"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <code className="font-medium break-all">{call.name}</code>
                    <span className="text-muted-foreground">
                      {status(call.status)}
                    </span>
                    {call.durationMs !== undefined ? (
                      <span className="text-muted-foreground">
                        {translate(locale, "session.tool.wallTime")}:{" "}
                        {call.durationMs < 1_000
                          ? translate(
                              locale,
                              "session.subagents.durationMilliseconds",
                              { count: Math.round(call.durationMs) }
                            )
                          : translate(
                              locale,
                              "session.subagents.durationSeconds",
                              { count: Math.round(call.durationMs / 1_000) }
                            )}
                      </span>
                    ) : null}
                  </div>
                  {call.args ? (
                    <pre className="mt-2 max-h-32 overflow-auto font-mono break-words whitespace-pre-wrap text-muted-foreground">
                      {call.args}
                    </pre>
                  ) : null}
                  {call.error ? (
                    <p className="mt-2 break-words whitespace-pre-wrap text-destructive">
                      {call.error}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {result ? (
          <ShellOrLiteralResult
            name="codemode"
            result={result}
            running={running}
            locale={locale}
          />
        ) : null}
      </div>
    </ConversationDisclosure>
  )
}

const WEB_ACCESS_ICONS: Record<WebAccessToolName, React.ReactNode> = {
  web_search: <SearchIcon />,
  fetch_content: <FileDownIcon />,
  get_search_content: <FileSearchIcon />,
}

function ToolResultAnchor({
  entryId,
  children,
}: {
  entryId?: string
  children: React.ReactNode
}) {
  return entryId ? (
    <ConversationAnchorContext value={entryId}>
      <div id={`entry-${entryId}`} className="min-w-0">
        {children}
      </div>
    </ConversationAnchorContext>
  ) : (
    children
  )
}

function WebAccessToolCard({
  name,
  part,
  result,
  running,
  failed,
  incomplete,
  locale,
}: {
  name: WebAccessToolName
  part: Extract<TranscriptPart, { type: "toolCall" }>
  result?: ToolResultView
  running: boolean
  failed: boolean
  incomplete: boolean
  locale: Locale
}) {
  const presentation = webAccessToolPresentation(
    name,
    part.arguments,
    result?.details,
    locale
  )
  const hasFailed = failed || presentation.error !== undefined
  return (
    <ConversationDisclosure
      defaultOpen={false}
      label={presentation.label}
      preview={presentation.preview}
      icon={WEB_ACCESS_ICONS[name]}
      tone="web"
      status={
        hasFailed
          ? translate(locale, "session.transcript.failed")
          : running
            ? translate(locale, "session.transcript.running")
            : translate(
                locale,
                incomplete
                  ? "session.transcript.incomplete"
                  : "session.transcript.complete"
              )
      }
      statusTone={
        hasFailed
          ? "destructive"
          : running
            ? "running"
            : incomplete
              ? "muted"
              : "success"
      }
      ariaLabel={translate(locale, "session.tool.expand", {
        name: presentation.label,
      })}
      contentClassName="max-w-full"
    >
      <div className="flex min-w-0 flex-col gap-4">
        {presentation.inputs.length ? (
          <section>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {name === "web_search"
                ? translate(locale, "session.tool.query")
                : translate(locale, "session.tool.target")}
            </p>
            <ul className="flex min-w-0 flex-col gap-1.5 text-sm">
              {presentation.inputs.map((input) => (
                <li
                  key={input}
                  className="min-w-0 rounded-lg bg-muted/50 px-3 py-2 break-words"
                >
                  {input}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
        {result ? (
          <section className="min-w-0">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {running
                ? translate(locale, "session.tool.liveResult")
                : translate(locale, "session.tool.result")}
            </p>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <ConversationTextParts parts={result.parts} locale={locale} />
            </div>
          </section>
        ) : null}
      </div>
    </ConversationDisclosure>
  )
}

function resultText(result: ToolResultView) {
  return result.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim()
}

function ShellOrLiteralResult({
  name,
  result,
  running,
  locale,
}: {
  name: string
  result: ToolResultView
  running: boolean
  locale: Locale
}) {
  const raw = resultText(result)
  const parsed =
    isShellToolName(name) && raw ? parseShellToolResult(raw) : undefined
  const facts = parsed
    ? [
        parsed.exitCode
          ? {
              label: translate(locale, "session.tool.exitCode"),
              value: parsed.exitCode,
            }
          : null,
        parsed.wallTime
          ? {
              label: translate(locale, "session.tool.wallTime"),
              value: parsed.wallTime,
            }
          : null,
      ].filter((fact) => fact !== null)
    : []

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {running
          ? translate(locale, "session.tool.liveResult")
          : translate(locale, "session.tool.result")}
      </p>
      {facts.length ? (
        <dl className="mb-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 gap-1.5">
              <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 break-all">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2 text-sm">
        <ConversationTextParts
          parts={
            parsed ? [{ type: "text", text: parsed.output }] : result.parts
          }
          literal
          locale={locale}
        />
      </div>
    </div>
  )
}

export function ToolCallCard({
  part,
  persistedResult,
  locale,
}: {
  part: Extract<TranscriptPart, { type: "toolCall" }>
  persistedResult?: ToolResultView
  locale: Locale
}) {
  const live = useStreamingTool(part.id)
  const runtimeStatus = useStreamingRuntimeStatus()
  const result = useDeferredValue(live?.result ?? persistedResult)
  const effectivePart = live
    ? {
        ...part,
        name: live.name || part.name,
        arguments: live.arguments,
      }
    : part
  const { running, failed, incomplete } = toolCallStatus(
    live,
    persistedResult,
    runtimeStatus
  )

  if (isWebAccessToolName(effectivePart.name)) {
    return (
      <ToolResultAnchor entryId={persistedResult?.entryId}>
        <WebAccessToolCard
          name={effectivePart.name}
          part={effectivePart}
          result={result}
          running={running}
          failed={failed}
          incomplete={incomplete}
          locale={locale}
        />
      </ToolResultAnchor>
    )
  }
  if (effectivePart.name === "codemode") {
    return (
      <ToolResultAnchor entryId={persistedResult?.entryId}>
        <CodemodeToolCard
          part={effectivePart}
          result={result}
          running={running}
          failed={failed}
          incomplete={incomplete}
          locale={locale}
        />
      </ToolResultAnchor>
    )
  }
  const hashlineKind = hashlineEditToolKind(
    effectivePart.name,
    effectivePart.arguments
  )
  if (hashlineKind) {
    return (
      <ToolResultAnchor entryId={persistedResult?.entryId}>
        <HashlineEditToolCard
          kind={hashlineKind}
          part={effectivePart}
          result={result}
          running={running}
          failed={failed}
          incomplete={incomplete}
          locale={locale}
        />
      </ToolResultAnchor>
    )
  }
  const mutationKind = fileMutationToolKind(effectivePart.name)
  if (mutationKind) {
    return (
      <ToolResultAnchor entryId={persistedResult?.entryId}>
        <FileMutationToolCard
          kind={mutationKind}
          part={effectivePart}
          result={result}
          running={running}
          failed={failed}
          incomplete={incomplete}
          locale={locale}
        />
      </ToolResultAnchor>
    )
  }
  const summary = toolSummary(effectivePart.name, effectivePart.arguments)
  const appearance = toolAppearance(effectivePart.name)
  return (
    <ToolResultAnchor entryId={persistedResult?.entryId}>
      <ConversationDisclosure
        defaultOpen={false}
        label={
          <code className="font-mono text-xs">
            {mcpToolLabel(effectivePart.name, result?.details)}
          </code>
        }
        preview={summary}
        icon={appearance.icon}
        tone={appearance.tone}
        status={
          failed
            ? translate(locale, "session.transcript.failed")
            : running
              ? translate(locale, "session.transcript.running")
              : translate(
                  locale,
                  incomplete
                    ? "session.transcript.incomplete"
                    : "session.transcript.complete"
                )
        }
        statusTone={
          failed
            ? "destructive"
            : running
              ? "running"
              : incomplete
                ? "muted"
                : "success"
        }
        ariaLabel={translate(locale, "session.tool.expand", {
          name: effectivePart.name,
        })}
      >
        <div className="flex min-w-0 flex-col gap-3">
          <section>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {translate(locale, "session.tool.arguments")}
            </p>
            <pre className="max-h-72 max-w-full overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-5">
              {json(effectivePart.arguments)}
            </pre>
          </section>
          {result ? (
            <ShellOrLiteralResult
              name={effectivePart.name}
              result={result}
              running={running}
              locale={locale}
            />
          ) : null}
        </div>
      </ConversationDisclosure>
    </ToolResultAnchor>
  )
}

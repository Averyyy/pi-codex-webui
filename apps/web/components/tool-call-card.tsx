"use client"

import { useDeferredValue } from "react"
import {
  BotIcon,
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
  type ConversationDisclosureTone,
} from "@/components/conversation-disclosure"
import { ConversationTextParts } from "@/components/conversation-text-parts"
import { FileMutationToolCard } from "@/components/file-mutation-tool-card"
import { HashlineEditToolCard } from "@/components/hashline-edit-tool-card"
import { useStreamingTool } from "@/components/session-streaming-context"
import { fileMutationToolKind } from "@/lib/file-mutation-tool"
import { hashlineEditToolKind } from "@/lib/hashline-edit-tool"
import { translate, type Locale } from "@/lib/i18n"
import type { ToolResultView } from "@/lib/message-content"
import type { TranscriptPart } from "@/lib/session-types"
import {
  isWebAccessToolName,
  webAccessToolPresentation,
  type WebAccessToolName,
} from "@/lib/web-access-tool"

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

function toolAppearance(name: string): {
  icon: React.ReactNode
  tone: ConversationDisclosureTone
} {
  switch (name) {
    case "bash":
      return { icon: <TerminalIcon />, tone: "execute" }
    case "Agent":
      return { icon: <BotIcon />, tone: "agent" }
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
    <div id={`entry-${entryId}`} className="min-w-0">
      {children}
    </div>
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
  locale,
}: {
  name: WebAccessToolName
  part: Extract<TranscriptPart, { type: "toolCall" }>
  result?: ToolResultView
  running: boolean
  failed: boolean
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
            : translate(locale, "session.transcript.complete")
      }
      statusTone={hasFailed ? "destructive" : running ? "running" : "success"}
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
  const result = useDeferredValue(live?.result ?? persistedResult)
  const effectivePart = live
    ? {
        ...part,
        name: live.name || part.name,
        arguments: live.arguments,
      }
    : part
  const running = live ? live.status === "running" : !persistedResult
  const failed = live
    ? live.status === "error"
    : persistedResult?.isError === true

  if (isWebAccessToolName(effectivePart.name)) {
    return (
      <ToolResultAnchor entryId={persistedResult?.entryId}>
        <WebAccessToolCard
          name={effectivePart.name}
          part={effectivePart}
          result={result}
          running={running}
          failed={failed}
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
        label={<code className="font-mono text-xs">{effectivePart.name}</code>}
        preview={summary}
        icon={appearance.icon}
        tone={appearance.tone}
        status={
          failed
            ? translate(locale, "session.transcript.failed")
            : running
              ? translate(locale, "session.transcript.running")
              : translate(locale, "session.transcript.complete")
        }
        statusTone={failed ? "destructive" : running ? "running" : "success"}
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
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {running
                  ? translate(locale, "session.tool.liveResult")
                  : translate(locale, "session.tool.result")}
              </p>
              <div className="flex min-w-0 flex-col gap-2 text-sm">
                <ConversationTextParts
                  parts={result.parts}
                  literal
                  locale={locale}
                />
              </div>
            </div>
          ) : null}
        </div>
      </ConversationDisclosure>
    </ToolResultAnchor>
  )
}

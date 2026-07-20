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
import { useStreamingTool } from "@/components/session-streaming-context"
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

function WebAccessToolCard({
  name,
  part,
  result,
  running,
  failed,
}: {
  name: WebAccessToolName
  part: Extract<TranscriptPart, { type: "toolCall" }>
  result?: ToolResultView
  running: boolean
  failed: boolean
}) {
  const presentation = webAccessToolPresentation(
    name,
    part.arguments,
    result?.details
  )
  const hasFailed = failed || presentation.error !== undefined
  return (
    <ConversationDisclosure
      defaultOpen={hasFailed}
      label={presentation.label}
      preview={presentation.preview}
      icon={WEB_ACCESS_ICONS[name]}
      tone="web"
      status={hasFailed ? "失败" : running ? "运行中" : "完成"}
      statusTone={hasFailed ? "destructive" : running ? "running" : "success"}
      ariaLabel={`展开${presentation.label}详情`}
      contentClassName="max-w-full"
    >
      <div className="flex min-w-0 flex-col gap-4">
        {presentation.inputs.length ? (
          <section>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {name === "web_search" ? "查询" : "目标"}
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
              {running ? "实时结果" : "结果"}
            </p>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <ConversationTextParts parts={result.parts} />
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
}: {
  part: Extract<TranscriptPart, { type: "toolCall" }>
  persistedResult?: ToolResultView
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
      <WebAccessToolCard
        name={effectivePart.name}
        part={effectivePart}
        result={result}
        running={running}
        failed={failed}
      />
    )
  }
  const summary = toolSummary(effectivePart.name, effectivePart.arguments)
  const appearance = toolAppearance(effectivePart.name)
  return (
    <ConversationDisclosure
      defaultOpen={failed}
      label={<code className="font-mono text-xs">{effectivePart.name}</code>}
      preview={summary}
      icon={appearance.icon}
      tone={appearance.tone}
      status={failed ? "失败" : running ? "运行中" : "完成"}
      statusTone={failed ? "destructive" : running ? "running" : "success"}
      ariaLabel={`展开 ${effectivePart.name} 详情`}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <section>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            参数
          </p>
          <pre className="max-h-72 max-w-full overflow-auto rounded-lg bg-muted/60 p-3 font-mono text-xs leading-5">
            {json(effectivePart.arguments)}
          </pre>
        </section>
        {result ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              {running ? "实时结果" : "结果"}
            </p>
            <div className="flex min-w-0 flex-col gap-2 text-sm">
              <ConversationTextParts parts={result.parts} literal />
            </div>
          </div>
        ) : null}
      </div>
    </ConversationDisclosure>
  )
}

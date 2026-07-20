import { BrainIcon, LoaderCircleIcon } from "lucide-react"

import { ConversationDisclosure } from "@/components/conversation-disclosure"
import { Markdown } from "@/components/markdown"
import { stripAnsi } from "@/lib/ansi"
import { formatInlinePreview } from "@/lib/session-display"
import type { TranscriptPart } from "@/lib/session-types"

function json(value: unknown) {
  return JSON.stringify(value, null, 2)
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

function ConversationTextPart({
  part,
  literal,
  thinkingActive,
}: {
  part: Exclude<TranscriptPart, { type: "toolCall" }>
  literal: boolean
  thinkingActive: boolean
}) {
  if (part.type === "text") {
    return literal ? (
      <pre className="max-h-96 overflow-auto rounded-lg border bg-terminal p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-terminal-foreground">
        {stripAnsi(part.text)}
      </pre>
    ) : (
      <Markdown>{part.text}</Markdown>
    )
  }
  if (part.type === "thinking") {
    const active = thinkingActive && !part.redacted
    return (
      <ConversationDisclosure
        label={part.redacted ? "已脱敏思考" : active ? "思考中" : "思考"}
        preview={formatInlinePreview(part.text)}
        icon={
          active ? <LoaderCircleIcon className="animate-spin" /> : <BrainIcon />
        }
        tone="agent"
        ariaLabel={
          part.redacted
            ? "展开已脱敏思考"
            : active
              ? "展开正在生成的思考"
              : "展开思考"
        }
        contentClassName="max-h-80 overflow-y-auto pr-2 text-xs text-muted-foreground [&_p]:leading-5"
      >
        <Markdown>{part.text}</Markdown>
      </ConversationDisclosure>
    )
  }
  if (part.type === "image") return <ImagePart part={part} />
  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="mb-2 text-xs font-medium">
        未支持的 content part：{part.partType}
      </p>
      <pre className="overflow-x-auto text-xs">{json(part.value)}</pre>
    </div>
  )
}

export function ConversationTextParts({
  parts,
  literal = false,
  thinkingActive = false,
}: {
  parts: TranscriptPart[]
  literal?: boolean
  thinkingActive?: boolean
}) {
  return parts.map((part, index) =>
    part.type === "toolCall" ? null : (
      <ConversationTextPart
        key={index}
        part={part}
        literal={literal}
        thinkingActive={thinkingActive}
      />
    )
  )
}

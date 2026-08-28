"use client"

import {
  memo,
  useContext,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"
import { LoaderCircleIcon, TerminalIcon } from "lucide-react"

import { SessionExtensionContext } from "@/components/session-extension-provider"
import { ConversationDisclosure } from "@/components/conversation-disclosure"
import { ConversationMessageParts } from "@/components/conversation-message-parts"
import { useI18n } from "@/components/i18n-provider"
import {
  useStreamingActiveTools,
  useStreamingFollowRequest,
  useStreamingMessages,
} from "@/components/session-streaming-context"
import type { StreamingMessageView } from "@/lib/session-stream-store"
import { formatInlinePreview } from "@/lib/session-display"
import { replacesStreamingMessage } from "@/lib/webui-message-replacements"

export {
  SessionStreamingProvider,
  useSessionEvents,
  useSessionStreaming,
} from "@/components/session-streaming-context"

const COMPLETED_MESSAGE_CLASS =
  "[content-visibility:auto] [contain-intrinsic-size:auto_5rem]"

function isFinalOutputPart(part: StreamingMessageView["parts"][number]) {
  return part.type !== "thinking" && part.type !== "toolCall"
}

const StreamingMessage = memo(function StreamingMessage({
  message,
}: {
  message: StreamingMessageView
}) {
  const { locale, t } = useI18n()
  const deferredParts = useDeferredValue(message.parts)
  const parts = message.role === "assistant" ? deferredParts : message.parts
  const content = (
    <ConversationMessageParts
      parts={parts}
      thinkingActive={message.role === "assistant" && !message.complete}
      locale={locale}
    />
  )

  if (message.role === "user") {
    return (
      <article
        className={`ml-auto flex w-fit max-w-[88%] min-w-0 flex-col gap-2 rounded-2xl bg-muted px-3.5 py-2.5 ${message.complete ? COMPLETED_MESSAGE_CLASS : ""}`}
      >
        {content}
      </article>
    )
  }

  return (
    <article
      data-streaming-message={message.role === "assistant" ? "" : undefined}
      aria-label={
        message.role === "assistant"
          ? t("session.streaming.reply")
          : message.role
      }
      aria-busy={message.role === "assistant" && !message.complete}
      className={`flex min-w-0 flex-col gap-2 ${message.complete ? COMPLETED_MESSAGE_CLASS : ""}`}
    >
      {message.role !== "assistant" ? (
        <div className="text-xs font-medium">{message.role}</div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-2">
        {parts.length ? (
          content
        ) : !message.complete ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin" />
            {t("session.streaming.generating")}
          </span>
        ) : null}
        {message.errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {message.errorMessage}
          </p>
        ) : null}
      </div>
    </article>
  )
})

export function SessionStreamingMessage() {
  const { t } = useI18n()
  const streamedMessages = useStreamingMessages()
  const extensions = useContext(SessionExtensionContext)
  const messages = extensions
    ? streamedMessages.filter(
        (message) => !replacesStreamingMessage(extensions.views, message)
      )
    : streamedMessages
  const activeTools = useStreamingActiveTools()
  const followRequest = useStreamingFollowRequest()
  const contentRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(false)
  const processIndex = messages.findIndex((message) => message.role !== "user")
  const visibleMessages =
    processIndex < 0 ? messages : messages.slice(0, processIndex)
  const workMessages = processIndex < 0 ? [] : messages.slice(processIndex)
  let finalIndex = -1
  for (let index = workMessages.length - 1; index >= 0; index -= 1) {
    const message = workMessages[index]!
    if (message.role === "assistant" && message.parts.some(isFinalOutputPart)) {
      finalIndex = index
      break
    }
  }
  const finalMessage = finalIndex >= 0 ? workMessages[finalIndex] : undefined
  const finalPartIndex = finalMessage?.parts.findIndex(isFinalOutputPart) ?? -1
  const processMessages = workMessages
    .slice(0, finalIndex >= 0 ? finalIndex : workMessages.length)
    .concat(
      finalMessage && finalPartIndex > 0
        ? [
            {
              ...finalMessage,
              parts: finalMessage.parts.slice(0, finalPartIndex),
            },
          ]
        : []
    )
  const finalMessages =
    finalMessage && finalPartIndex >= 0
      ? [
          {
            ...finalMessage,
            parts: finalMessage.parts.slice(finalPartIndex),
          },
          ...workMessages.slice(finalIndex + 1),
        ]
      : []
  const processPreview = processMessages
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === "text" || part.type === "thinking" ? [part.text] : []
      )
    )
    .map(formatInlinePreview)
    .find(Boolean)

  useEffect(() => {
    const content = contentRef.current
    const tail = tailRef.current
    if (!content || !tail) return

    const intersection = new IntersectionObserver(([entry]) => {
      followingRef.current = entry?.isIntersecting === true
    })
    const resize = new ResizeObserver(() => {
      if (followingRef.current) tail.scrollIntoView({ block: "end" })
    })
    intersection.observe(tail)
    resize.observe(content)
    return () => {
      intersection.disconnect()
      resize.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    if (followRequest === 0) return
    followingRef.current = true
    tailRef.current?.scrollIntoView({ block: "end" })
  }, [followRequest])

  return (
    <>
      <div
        ref={contentRef}
        aria-live="polite"
        aria-busy={
          activeTools.length > 0 ||
          messages.some((message) => !message.complete)
        }
        className={messages.length ? "flex min-w-0 flex-col gap-5" : "hidden"}
      >
        {visibleMessages.map((message) => (
          <StreamingMessage key={message.id} message={message} />
        ))}
        {processMessages.length ? (
          <ConversationDisclosure
            label={t("session.transcript.process")}
            preview={processPreview}
            icon={<TerminalIcon />}
            tone="execute"
            status={t("session.transcript.running")}
            statusTone="running"
            ariaLabel={t("session.transcript.expandProcess")}
            contentClassName="flex min-w-0 flex-col gap-5"
          >
            {processMessages.map((message) => (
              <StreamingMessage key={message.id} message={message} />
            ))}
          </ConversationDisclosure>
        ) : null}
        {finalMessages.map((message) => (
          <StreamingMessage key={`${message.id}:final`} message={message} />
        ))}
      </div>
      <div ref={tailRef} className="h-px" aria-hidden="true" />
    </>
  )
}

export function SessionStreamingToolStatus() {
  const { locale, t } = useI18n()
  const activeTools = useStreamingActiveTools()
  if (activeTools.length === 0) return null
  const description =
    activeTools.length <= 2
      ? activeTools
          .map((tool) => tool.name)
          .join(locale === "zh-CN" ? "、" : ", ")
      : t("session.streaming.activeTools", { count: activeTools.length })
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      {t("session.streaming.executing", { name: description })}
    </span>
  )
}

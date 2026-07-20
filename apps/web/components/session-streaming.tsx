"use client"

import {
  memo,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"
import { LoaderCircleIcon } from "lucide-react"

import { ConversationMessageParts } from "@/components/conversation-message-parts"
import {
  useStreamingActiveTools,
  useStreamingFollowRequest,
  useStreamingMessages,
} from "@/components/session-streaming-context"
import type { StreamingMessageView } from "@/lib/session-stream-store"

export {
  SessionStreamingProvider,
  useSessionStreaming,
} from "@/components/session-streaming-context"

const COMPLETED_MESSAGE_CLASS =
  "[content-visibility:auto] [contain-intrinsic-size:auto_5rem]"

const StreamingMessage = memo(function StreamingMessage({
  message,
}: {
  message: StreamingMessageView
}) {
  const deferredParts = useDeferredValue(message.parts)
  const parts = message.role === "assistant" ? deferredParts : message.parts
  const content = (
    <ConversationMessageParts
      parts={parts}
      thinkingActive={message.role === "assistant" && !message.complete}
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
        message.role === "assistant" ? "正在生成的回复" : message.role
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
            正在生成
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
  const messages = useStreamingMessages()
  const activeTools = useStreamingActiveTools()
  const followRequest = useStreamingFollowRequest()
  const contentRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(false)

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
        {messages.map((message) => (
          <StreamingMessage key={message.id} message={message} />
        ))}
      </div>
      <div ref={tailRef} className="h-px" aria-hidden="true" />
    </>
  )
}

export function SessionStreamingToolStatus() {
  const activeTools = useStreamingActiveTools()
  if (activeTools.length === 0) return null
  const description =
    activeTools.length <= 2
      ? activeTools.map((tool) => tool.name).join("、")
      : `${activeTools.length} 个工具`
  return (
    <span className="text-xs text-muted-foreground" aria-live="polite">
      正在执行 {description}
    </span>
  )
}

"use client"

import { memo, useContext, useDeferredValue } from "react"
import { LoaderCircleIcon } from "lucide-react"

import { SessionExtensionContext } from "@/components/session-extension-provider"
import { ConversationProcess } from "@/components/conversation-process"
import { ConversationMessageParts } from "@/components/conversation-message-parts"
import { useI18n } from "@/components/i18n-provider"
import {
  useStreamingActiveTools,
  useStreamingMessages,
  useStreamingRuntimeStatus,
  useStreamingSessionId,
  useSessionTranscript,
  useSessionViewController,
} from "@/components/session-streaming-context"
import type { StreamingMessageView } from "@/lib/session-stream-store"
import {
  conversationRounds,
  partitionConversationRound,
} from "@/lib/conversation-rounds"
import { replacesStreamingMessage } from "@/lib/webui-message-replacements"

export {
  SessionStreamingProvider,
  useSessionEvents,
  useSessionStreaming,
} from "@/components/session-streaming-context"

const COMPLETED_MESSAGE_CLASS =
  "[content-visibility:auto] [contain-intrinsic-size:auto_5rem]"

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
      plainText={message.role === "user"}
      thinkingActive={message.role === "assistant" && !message.complete}
      locale={locale}
    />
  )

  if (message.role === "user") {
    return (
      <article
        id={"live-message-" + message.id}
        className={`ml-auto flex w-fit max-w-[88%] min-w-0 flex-col gap-2 rounded-2xl bg-muted px-3.5 py-2.5 ${message.complete ? COMPLETED_MESSAGE_CLASS : ""}`}
      >
        {content}
      </article>
    )
  }

  return (
    <article
      id={"live-message-" + message.id}
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
        {message.stopReason === "aborted" ? (
          <p className="text-xs text-muted-foreground">
            {t("session.transcript.aborted")}
          </p>
        ) : null}
        {message.errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {message.errorMessage}
          </p>
        ) : null}
        {message.stopReason === "length" ? (
          <p className="text-xs text-muted-foreground">
            {t("session.transcript.lengthLimit")}
          </p>
        ) : null}
      </div>
    </article>
  )
})

export function SessionStreamingMessage() {
  const controller = useSessionViewController()
  const history = useSessionTranscript(controller.initialView.snapshot)
  const { t } = useI18n()
  const streamedMessages = useStreamingMessages()
  const extensions = useContext(SessionExtensionContext)
  const messages = extensions
    ? streamedMessages.filter(
        (message) => !replacesStreamingMessage(extensions.views, message)
      )
    : streamedMessages
  const runtimeStatus = useStreamingRuntimeStatus()
  const sessionId = useStreamingSessionId()
  const rounds = conversationRounds(messages)
  const active =
    runtimeStatus === "busy" ||
    runtimeStatus === "starting" ||
    runtimeStatus === "stopping"

  if (history.history?.atLatest === false) return null

  return (
    <>
      <div
        aria-live="polite"
        aria-busy={active}
        className={messages.length ? "flex min-w-0 flex-col gap-5" : "hidden"}
      >
        {rounds.map((round, index) => {
          const { leading, process, response, trailing, outcome } =
            partitionConversationRound(round)
          return (
            <div key={round[0]!.id} className="flex min-w-0 flex-col gap-5">
              {leading.map((message) => (
                <StreamingMessage key={message.id} message={message} />
              ))}
              {process.length ? (
                <ConversationProcess
                  disclosureKey={JSON.stringify([
                    sessionId,
                    "stream",
                    round[0]?.id,
                  ])}
                  hasResponse={Boolean(response)}
                  outcome={outcome}
                  active={active && index === rounds.length - 1}
                  t={t}
                >
                  {process.map((message) => (
                    <StreamingMessage key={message.id} message={message} />
                  ))}
                </ConversationProcess>
              ) : null}
              {response ? (
                <StreamingMessage
                  key={response.id + ":final"}
                  message={response}
                />
              ) : null}
              {trailing.map((message) => (
                <StreamingMessage key={message.id} message={message} />
              ))}
            </div>
          )
        })}
      </div>
      <div className="h-px" aria-hidden="true" />
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

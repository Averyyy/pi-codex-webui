"use client"

import { useCallback, useSyncExternalStore, type ReactNode } from "react"

import { ConversationDisclosure } from "@/components/conversation-disclosure"
import {
  canCollapseConversation,
  type ConversationOutcome,
} from "@/lib/conversation-rounds"
import type { Translator } from "@/lib/i18n"
import {
  readConversationDisclosure,
  setConversationDisclosure,
  subscribeConversationDisclosures,
  serverConversationDisclosure,
} from "@/lib/conversation-disclosure-state"

export function ConversationProcess({
  hasResponse,
  outcome,
  active,
  duration,
  entryIds,
  children,
  t,
  disclosureKey,
}: {
  hasResponse: boolean
  outcome: ConversationOutcome
  active: boolean
  duration?: string | null
  entryIds?: readonly string[]
  children: ReactNode
  t: Translator
  disclosureKey: string
}) {
  const getOpen = useCallback(
    () => readConversationDisclosure(disclosureKey),
    [disclosureKey]
  )
  const open = useSyncExternalStore(
    subscribeConversationDisclosures,
    getOpen,
    serverConversationDisclosure
  )
  const status =
    outcome === "failed"
      ? t("session.transcript.failed")
      : outcome === "incomplete"
        ? t("session.transcript.incomplete")
        : active && !hasResponse
          ? t("session.transcript.running")
          : undefined
  return (
    <ConversationDisclosure
      variant="process"
      collapsible={canCollapseConversation(hasResponse, outcome)}
      open={open}
      onOpenChange={(value) => setConversationDisclosure(disclosureKey, value)}
      label={
        duration && duration !== "0s" && !active && outcome !== "pending"
          ? t("session.transcript.elapsed", { duration })
          : t("session.transcript.process")
      }
      icon={null}
      status={status}
      statusTone={
        outcome === "failed"
          ? "destructive"
          : active && !hasResponse
            ? "running"
            : "muted"
      }
      ariaLabel={t("session.transcript.expandProcess")}
      collapseAriaLabel={t("session.transcript.collapseProcess")}
      entryIds={entryIds}
      contentClassName="flex min-w-0 flex-col gap-5 pb-2"
    >
      {children}
    </ConversationDisclosure>
  )
}

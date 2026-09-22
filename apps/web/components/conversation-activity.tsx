"use client"

import { useCallback, useSyncExternalStore, type ReactNode } from "react"
import { BrainIcon, TerminalIcon } from "lucide-react"

import { ConversationDisclosure } from "@/components/conversation-disclosure"
import type { Translator } from "@/lib/i18n"
import {
  readConversationDisclosure,
  serverConversationDisclosure,
  setConversationDisclosure,
  subscribeConversationDisclosures,
} from "@/lib/conversation-disclosure-state"

/**
 * The second disclosure level inside a work process.
 *
 * The component owns only the activity disclosure state. Its children are
 * rendered through the regular CollapsibleContent path, so closed activities
 * keep the same lazy rendering behavior as individual tool rows.
 */
export function ConversationActivity({
  commandCount,
  active,
  entryIds,
  disclosureKey,
  children,
  t,
}: {
  commandCount: number
  active: boolean
  entryIds?: readonly string[]
  disclosureKey: string
  children: ReactNode
  t: Translator
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
  const hasCommands = commandCount > 0

  return (
    <div
      data-conversation-activity={active ? "running" : "complete"}
      className="min-w-0"
    >
      <ConversationDisclosure
        variant="tool"
        tone={hasCommands ? "execute" : "agent"}
        icon={hasCommands ? <TerminalIcon /> : <BrainIcon />}
        label={
          hasCommands
            ? t("session.transcript.commands")
            : t("session.transcript.thought")
        }
        preview={
          hasCommands && commandCount > 1
            ? t("session.transcript.commandsCount", { count: commandCount })
            : undefined
        }
        status={active ? t("session.transcript.running") : undefined}
        statusTone={active ? "running" : "muted"}
        open={open}
        onOpenChange={(value) =>
          setConversationDisclosure(disclosureKey, value)
        }
        entryIds={entryIds}
        ariaLabel={t("session.transcript.expandActivity")}
        collapseAriaLabel={t("session.transcript.collapseActivity")}
        contentClassName="flex min-w-0 flex-col gap-3"
      >
        {children}
      </ConversationDisclosure>
    </div>
  )
}

"use client"

import { useContext, type ReactNode } from "react"

import { SessionExtensionContext } from "@/components/session-extension-provider"
import { replacesTranscriptEntry } from "@/lib/webui-message-replacements"

export function WebUiMessageFallback({
  entryId,
  children,
}: {
  entryId: string
  children: ReactNode
}) {
  const runtime = useContext(SessionExtensionContext)
  return runtime && replacesTranscriptEntry(runtime.views, entryId)
    ? null
    : children
}

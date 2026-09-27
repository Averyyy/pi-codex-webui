"use client"

import type { ReactNode } from "react"

import { useSessionExtensionHasReplacementEntry } from "@/components/session-extension-provider"

export function WebUiMessageFallback({
  entryId,
  children,
}: {
  entryId: string
  children: ReactNode
}) {
  const replaced = useSessionExtensionHasReplacementEntry(entryId)
  return replaced ? null : children
}

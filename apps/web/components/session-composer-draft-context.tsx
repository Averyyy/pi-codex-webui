"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import { SessionComposerDraftStore } from "@/lib/session-composer-draft-store"

const SessionComposerDraftContext =
  createContext<SessionComposerDraftStore | null>(null)

export function SessionComposerDraftProvider({
  children,
}: {
  children: ReactNode
}) {
  const [store] = useState(() => new SessionComposerDraftStore())

  return (
    <SessionComposerDraftContext value={store}>
      {children}
    </SessionComposerDraftContext>
  )
}

export function useSessionComposerDraftStore() {
  const store = useContext(SessionComposerDraftContext)
  if (!store) {
    throw new Error("Session drafts require SessionComposerDraftProvider.")
  }
  return store
}

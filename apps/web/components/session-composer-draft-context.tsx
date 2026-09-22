"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import {
  clearUpdateDraftHandoff,
  readUpdateDraftHandoff,
  SessionComposerDraftStore,
} from "@/lib/session-composer-draft-store"

const SessionComposerDraftContext =
  createContext<SessionComposerDraftStore | null>(null)
const SessionComposerDraftHandoffErrorContext = createContext<string | null>(
  null
)

export function SessionComposerDraftProvider({
  children,
}: {
  children: ReactNode
}) {
  const [initialState] = useState(() => {
    const nextStore = new SessionComposerDraftStore()
    let restored = false
    let error: string | null = null
    if (typeof window !== "undefined") {
      try {
        const handoff = readUpdateDraftHandoff()
        if (handoff) {
          nextStore.restoreUpdateHandoff(handoff)
          restored = true
        }
      } catch (failure) {
        error = failure instanceof Error ? failure.message : String(failure)
      }
    }
    return { store: nextStore, restored, error }
  })
  const [clearError, setClearError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialState.restored || typeof window === "undefined") return
    let disposed = false
    try {
      clearUpdateDraftHandoff()
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure)
      queueMicrotask(() => {
        if (!disposed) setClearError(message)
      })
    }
    return () => {
      disposed = true
    }
  }, [initialState.restored])

  const handoffError = initialState.error ?? clearError

  return (
    <SessionComposerDraftContext value={initialState.store}>
      <SessionComposerDraftHandoffErrorContext value={handoffError}>
        {children}
      </SessionComposerDraftHandoffErrorContext>
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

export function useSessionComposerDraftHandoffError() {
  return useContext(SessionComposerDraftHandoffErrorContext)
}

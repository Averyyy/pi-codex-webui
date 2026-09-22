"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  APP_UPDATE_BROADCAST_CHANNEL,
  APP_UPDATE_BROADCAST_STORAGE_KEY,
  APP_UPDATE_OPERATION_TIMEOUT_MS,
  APP_UPDATE_PENDING_STORAGE_KEY,
  APP_UPDATE_STATUS_TTL_MS,
  AppUpdateError,
  canRecoverAppUpdate,
  createPendingAppUpdate,
  fetchAppUpdateStatus,
  fetchHealthVersion,
  isAppUpdateSnapshot,
  isUpdateReadyForReload,
  parsePendingAppUpdateJson,
  requestAppUpdate,
  serializePendingAppUpdate,
  updatePollDelay,
  type AppUpdateOperation,
  type AppUpdateSnapshot,
  type UpdateFetch,
} from "@/lib/app-update-client"
import { writeUpdateDraftHandoff } from "@/lib/session-composer-draft-store"
import {
  useSessionComposerDraftHandoffError,
  useSessionComposerDraftStore,
} from "@/components/session-composer-draft-context"

interface AppUpdateBroadcastMessage {
  sourceId: string
  snapshot: AppUpdateSnapshot
  operation: AppUpdateOperation | null
}

interface AppUpdateContextValue {
  snapshot: AppUpdateSnapshot | null
  operation: AppUpdateOperation | null
  checking: boolean
  error: string | null
  refresh: () => Promise<void>
  startUpdate: () => Promise<void>
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null)

function sourceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isBusyPhase(phase: AppUpdateSnapshot["phase"]) {
  return phase === "installing" || phase === "restarting"
}

function readPendingOperation() {
  try {
    return parsePendingAppUpdateJson(
      window.sessionStorage.getItem(APP_UPDATE_PENDING_STORAGE_KEY)
    )
  } catch {
    return null
  }
}

function writePendingOperation(operation: AppUpdateOperation) {
  try {
    window.sessionStorage.setItem(
      APP_UPDATE_PENDING_STORAGE_KEY,
      serializePendingAppUpdate(operation)
    )
  } catch (failure) {
    throw new AppUpdateError(
      `Could not track the update operation in this browser tab: ${
        failure instanceof Error ? failure.message : String(failure)
      }`
    )
  }
}

function clearPendingOperation() {
  try {
    window.sessionStorage.removeItem(APP_UPDATE_PENDING_STORAGE_KEY)
  } catch (failure) {
    throw new AppUpdateError(
      `The update completed but its browser state could not be cleared: ${
        failure instanceof Error ? failure.message : String(failure)
      }`
    )
  }
}

function isSameOperation(
  left: AppUpdateOperation | null,
  right: AppUpdateOperation | null
) {
  return (
    left !== null &&
    right !== null &&
    left.targetVersion === right.targetVersion &&
    left.operationId === right.operationId
  )
}

function waitForPoll(signal: AbortSignal, delayMs: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Update monitor stopped.", "AbortError"))
      return
    }
    let settled = false
    const timer = window.setTimeout(() => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", abort)
      resolve()
    }, delayMs)
    const abort = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      signal.removeEventListener("abort", abort)
      reject(new DOMException("Update monitor stopped.", "AbortError"))
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

function formatFailure(failure: unknown) {
  return failure instanceof Error ? failure.message : String(failure)
}

export function AppUpdateProvider({
  mutationToken,
  children,
  fetcher = fetch,
}: {
  mutationToken: string
  children: React.ReactNode
  fetcher?: UpdateFetch
}) {
  const draftStore = useSessionComposerDraftStore()
  const draftHandoffError = useSessionComposerDraftHandoffError()
  const [initialPending] = useState<AppUpdateOperation | null>(() =>
    typeof window === "undefined" ? null : readPendingOperation()
  )
  const [snapshot, setSnapshot] = useState<AppUpdateSnapshot | null>(null)
  const [operation, setOperation] = useState<AppUpdateOperation | null>(
    initialPending
  )
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const snapshotRef = useRef<AppUpdateSnapshot | null>(null)
  const operationRef = useRef<AppUpdateOperation | null>(initialPending)
  const monitoringRef = useRef(false)
  const monitorAbortRef = useRef<AbortController | null>(null)
  const monitorGenerationRef = useRef(0)
  const refreshFlightRef = useRef<Promise<void> | null>(null)
  const lastCheckedAtRef = useRef(0)
  const sourceIdRef = useRef<string>("")
  const channelRef = useRef<BroadcastChannel | null>(null)
  const monitorOperationRef = useRef<
    ((pending: AppUpdateOperation) => Promise<void>) | null
  >(null)

  const publish = useCallback(
    (
      nextSnapshot: AppUpdateSnapshot,
      nextOperation: AppUpdateOperation | null
    ) => {
      if (!sourceIdRef.current) return
      const message: AppUpdateBroadcastMessage = {
        sourceId: sourceIdRef.current,
        snapshot: nextSnapshot,
        operation: nextOperation,
      }
      channelRef.current?.postMessage(message)
      try {
        window.localStorage.setItem(
          APP_UPDATE_BROADCAST_STORAGE_KEY,
          JSON.stringify({ ...message, at: Date.now() })
        )
      } catch {
        // BroadcastChannel still covers modern browsers; localStorage is only
        // the cross-tab fallback and may be disabled by browser policy.
      }
    },
    []
  )

  const applySnapshot = useCallback(
    (
      nextSnapshot: AppUpdateSnapshot,
      nextOperation: AppUpdateOperation | null
    ) => {
      snapshotRef.current = nextSnapshot
      setSnapshot(nextSnapshot)
      if (nextOperation) {
        operationRef.current = nextOperation
        setOperation(nextOperation)
      } else if (
        nextSnapshot.phase === "idle" ||
        nextSnapshot.phase === "succeeded"
      ) {
        operationRef.current = null
        setOperation(null)
      }
      if (draftHandoffError) {
        setError(draftHandoffError)
      } else if (
        nextSnapshot.error === null ||
        nextSnapshot.phase !== "failed"
      ) {
        setError(null)
      }
    },
    [draftHandoffError]
  )

  const refreshStatus = useCallback(
    async (force = false) => {
      if (monitoringRef.current) return
      const now = Date.now()
      if (!force && now - lastCheckedAtRef.current < APP_UPDATE_STATUS_TTL_MS) {
        return
      }
      if (refreshFlightRef.current) return refreshFlightRef.current
      lastCheckedAtRef.current = now
      setChecking(true)
      const flight = (async () => {
        try {
          const nextSnapshot = await fetchAppUpdateStatus(fetcher)
          let nextOperation = operationRef.current
          if (!nextOperation && canRecoverAppUpdate(nextSnapshot)) {
            nextOperation = createPendingAppUpdate(
              nextSnapshot.latestVersion,
              nextSnapshot.operationId
            )
            writePendingOperation(nextOperation)
          }
          applySnapshot(nextSnapshot, nextOperation)
          publish(nextSnapshot, nextOperation)
          if (
            nextOperation &&
            !monitoringRef.current &&
            (isBusyPhase(nextSnapshot.phase) ||
              nextSnapshot.phase === "succeeded")
          ) {
            void monitorOperationRef.current?.(nextOperation)
          }
        } catch (failure) {
          setError(formatFailure(failure))
        } finally {
          setChecking(false)
          refreshFlightRef.current = null
        }
      })()
      refreshFlightRef.current = flight
      return flight
    },
    [applySnapshot, fetcher, publish]
  )

  const monitorOperation = useCallback(
    async (pending: AppUpdateOperation) => {
      if (
        monitoringRef.current &&
        isSameOperation(operationRef.current, pending)
      ) {
        return
      }
      if (monitoringRef.current) return
      monitoringRef.current = true
      const generation = ++monitorGenerationRef.current
      monitorAbortRef.current?.abort()
      const controller = new AbortController()
      monitorAbortRef.current = controller
      operationRef.current = pending
      setOperation(pending)
      let attempt = 0
      let lastTransientFailure: unknown = null
      try {
        while (
          Date.now() - pending.startedAt <
          APP_UPDATE_OPERATION_TIMEOUT_MS
        ) {
          if (controller.signal.aborted) return
          try {
            const nextSnapshot = await fetchAppUpdateStatus(
              fetcher,
              controller.signal
            )
            applySnapshot(nextSnapshot, pending)
            publish(nextSnapshot, pending)
            if (nextSnapshot.phase === "failed") {
              throw new AppUpdateError(
                nextSnapshot.error ?? "The update operation failed."
              )
            }

            if (nextSnapshot.phase === "succeeded") {
              const healthVersion = await fetchHealthVersion(
                fetcher,
                controller.signal
              )
              if (
                isUpdateReadyForReload(
                  nextSnapshot,
                  pending.targetVersion,
                  healthVersion
                )
              ) {
                // This is deliberately the last write before reload. If the
                // browser cannot save drafts, the app stays open and exposes
                // the exact error instead of risking data loss.
                writeUpdateDraftHandoff(draftStore)
                clearPendingOperation()
                setError(null)
                publish(nextSnapshot, null)
                window.location.reload()
                return
              }
            }
            lastTransientFailure = null
          } catch (failure) {
            if (controller.signal.aborted) return
            if (failure instanceof AppUpdateError && failure.transient) {
              lastTransientFailure = failure
            } else {
              throw failure
            }
          }
          attempt += 1
          await waitForPoll(controller.signal, updatePollDelay(attempt))
        }
        throw new AppUpdateError(
          lastTransientFailure
            ? `The update did not become healthy before the timeout: ${formatFailure(lastTransientFailure)}`
            : "The update did not become healthy before the timeout."
        )
      } catch (failure) {
        if (controller.signal.aborted) return
        setError(formatFailure(failure))
        const failedSnapshot: AppUpdateSnapshot = {
          ...(snapshotRef.current ?? {
            supported: true,
            currentVersion: "",
            latestVersion: pending.targetVersion,
            available: true,
          }),
          phase: "failed",
          error: formatFailure(failure),
          operationId: pending.operationId,
        }
        applySnapshot(failedSnapshot, null)
        publish(failedSnapshot, null)
        try {
          clearPendingOperation()
        } catch (clearFailure) {
          setError(`${formatFailure(failure)} ${formatFailure(clearFailure)}`)
        }
      } finally {
        if (monitorGenerationRef.current === generation) {
          operationRef.current = null
          setOperation(null)
          if (monitorAbortRef.current === controller) {
            monitorAbortRef.current = null
          }
          monitoringRef.current = false
        }
      }
    },
    [applySnapshot, draftStore, fetcher, publish]
  )

  useEffect(() => {
    monitorOperationRef.current = monitorOperation
    return () => {
      if (monitorOperationRef.current === monitorOperation) {
        monitorOperationRef.current = null
      }
    }
  }, [monitorOperation])

  const startUpdate = useCallback(async () => {
    const current = snapshotRef.current
    if (
      monitoringRef.current ||
      operationRef.current !== null ||
      draftHandoffError !== null ||
      !current?.supported ||
      !current.available ||
      !current.latestVersion
    ) {
      return
    }
    const pending = createPendingAppUpdate(current.latestVersion)
    setError(null)
    try {
      writePendingOperation(pending)
      operationRef.current = pending
      setOperation(pending)
      const nextSnapshot = await requestAppUpdate(
        pending.targetVersion,
        mutationToken,
        fetcher
      )
      const accepted = {
        ...pending,
        operationId: nextSnapshot.operationId,
      }
      writePendingOperation(accepted)
      applySnapshot(nextSnapshot, accepted)
      publish(nextSnapshot, accepted)
      await monitorOperation(accepted)
    } catch (failure) {
      setError(formatFailure(failure))
      const failedSnapshot = snapshotRef.current
      if (failedSnapshot) {
        const nextSnapshot = {
          ...failedSnapshot,
          phase: "failed" as const,
          error: formatFailure(failure),
        }
        applySnapshot(nextSnapshot, operationRef.current)
        publish(nextSnapshot, operationRef.current)
      }
      try {
        clearPendingOperation()
      } catch (clearFailure) {
        setError(`${formatFailure(failure)} ${formatFailure(clearFailure)}`)
      }
      operationRef.current = null
      setOperation(null)
    }
  }, [
    applySnapshot,
    draftHandoffError,
    fetcher,
    monitorOperation,
    mutationToken,
    publish,
  ])

  useEffect(() => {
    sourceIdRef.current = sourceId()
    const channel =
      typeof BroadcastChannel === "function"
        ? new BroadcastChannel(APP_UPDATE_BROADCAST_CHANNEL)
        : null
    channelRef.current = channel

    const handleMessage = (value: unknown) => {
      if (!value || typeof value !== "object") return
      const message = value as Partial<AppUpdateBroadcastMessage>
      if (
        message.sourceId === sourceIdRef.current ||
        !isAppUpdateSnapshot(message.snapshot)
      ) {
        return
      }
      const nextOperation = message.operation ?? null
      applySnapshot(message.snapshot, nextOperation)
      if (
        nextOperation &&
        (isBusyPhase(message.snapshot.phase) ||
          message.snapshot.phase === "succeeded") &&
        !monitoringRef.current
      ) {
        try {
          writePendingOperation(nextOperation)
        } catch (failure) {
          setError(formatFailure(failure))
          return
        }
        void monitorOperationRef.current?.(nextOperation)
      }
    }
    const onChannelMessage = (event: MessageEvent<unknown>) =>
      handleMessage(event.data)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== APP_UPDATE_BROADCAST_STORAGE_KEY || !event.newValue) {
        return
      }
      try {
        const value = JSON.parse(event.newValue) as unknown
        handleMessage(value)
      } catch {
        // Ignore unrelated or malformed cross-tab messages.
      }
    }
    channel?.addEventListener("message", onChannelMessage)
    window.addEventListener("storage", onStorage)
    return () => {
      channel?.removeEventListener("message", onChannelMessage)
      channel?.close()
      channelRef.current = null
      window.removeEventListener("storage", onStorage)
      monitorAbortRef.current?.abort()
      monitorGenerationRef.current += 1
      monitoringRef.current = false
      monitorAbortRef.current = null
    }
  }, [applySnapshot])

  useEffect(() => {
    const pending = initialPending
    if (pending) {
      operationRef.current = pending
      if (Date.now() - pending.startedAt >= APP_UPDATE_OPERATION_TIMEOUT_MS) {
        const timeoutError = "The previous update operation timed out."
        queueMicrotask(() => setError(timeoutError))
        const current = snapshotRef.current
        if (current) {
          const failedSnapshot = {
            ...current,
            phase: "failed" as const,
            error: timeoutError,
            operationId: pending.operationId,
          }
          applySnapshot(failedSnapshot, pending)
        }
        try {
          clearPendingOperation()
        } catch (failure) {
          setError(`${timeoutError} ${formatFailure(failure)}`)
        }
        operationRef.current = null
        setOperation(null)
      } else {
        void monitorOperation(pending)
      }
      return
    }
    void refreshStatus(true)
  }, [applySnapshot, initialPending, monitorOperation, refreshStatus])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshStatus()
    }
    const onFocus = () => void refreshStatus()
    const timer = window.setInterval(
      () => void refreshStatus(),
      APP_UPDATE_STATUS_TTL_MS
    )
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("focus", onFocus)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("focus", onFocus)
      monitorAbortRef.current?.abort()
      monitorGenerationRef.current += 1
      monitoringRef.current = false
      monitorAbortRef.current = null
    }
  }, [refreshStatus])

  const value = useMemo<AppUpdateContextValue>(
    () => ({
      snapshot,
      operation,
      checking,
      error: draftHandoffError ?? error,
      refresh: () => refreshStatus(true),
      startUpdate,
    }),
    [
      checking,
      draftHandoffError,
      error,
      operation,
      refreshStatus,
      snapshot,
      startUpdate,
    ]
  )

  return (
    <AppUpdateContext.Provider value={value}>
      {children}
    </AppUpdateContext.Provider>
  )
}

export function useAppUpdate() {
  const context = useContext(AppUpdateContext)
  if (!context) {
    throw new Error("useAppUpdate must be used within AppUpdateProvider.")
  }
  return context
}

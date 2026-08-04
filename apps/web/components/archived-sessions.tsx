"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArchiveIcon,
  LoaderCircleIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { useI18n } from "@/components/i18n-provider"
import { responseJson } from "@/lib/api-response"
import { nextArchiveFocusTarget } from "@/lib/archive-focus"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"
import type { ArchivedSession } from "@/lib/session-types"

type ArchiveOperation = "restore" | "delete"

export function ArchivedSessions({
  initial,
  mutationToken,
}: {
  initial: ArchivedSession[]
  mutationToken: string
}) {
  const router = useRouter()
  const { locale, t } = useI18n()
  const [removedSessionIds, setRemovedSessionIds] = useState<Set<string>>(
    () => new Set()
  )
  const [working, setWorking] = useState<{
    sessionId: string
    operation: ArchiveOperation
  } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ArchivedSession | null>(
    null
  )
  const restoreButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const emptyStateRef = useRef<HTMLDivElement>(null)
  const focusAfterOperationRef = useRef<
    | {
        sessionId: string | null
        operation: ArchiveOperation
      }
    | undefined
  >(undefined)

  const sessions = initial.filter(
    (session) => !removedSessionIds.has(session.id)
  )
  const sessionTitleFallback = {
    task: t("workspace.nav.newTask"),
    conversation: t("workspace.nav.unnamedConversation"),
  }

  useLayoutEffect(() => {
    if (working !== null) return

    const focusTarget = focusAfterOperationRef.current
    if (focusTarget === undefined) return
    focusAfterOperationRef.current = undefined
    if (focusTarget.sessionId === null) emptyStateRef.current?.focus()
    else {
      const refs =
        focusTarget.operation === "restore"
          ? restoreButtonRefs.current
          : deleteButtonRefs.current
      refs.get(focusTarget.sessionId)?.focus()
    }
  }, [removedSessionIds, working])

  async function restoreSession(sessionId: string) {
    const successFocusTarget = nextArchiveFocusTarget(
      sessions.map((session) => session.id),
      sessionId
    )
    setWorking({ sessionId, operation: "restore" })
    let restored = false
    try {
      await responseJson(
        await fetch(`/api/v1/sessions/${sessionId}/restore`, {
          method: "POST",
          headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
        }),
        t("settings.archive.restoreFailed")
      )
      setRemovedSessionIds((current) => new Set(current).add(sessionId))
      restored = true
      router.refresh()
      toast.success(t("settings.archive.restored"))
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      focusAfterOperationRef.current = {
        sessionId: restored ? successFocusTarget : sessionId,
        operation: "restore",
      }
      setWorking(null)
    }
  }

  async function deleteSession(
    sessionId: string,
    successFocusTarget: string | null
  ) {
    setWorking({ sessionId, operation: "delete" })
    let deleted = false
    try {
      await responseJson(
        await fetch(`/api/v1/sessions/${sessionId}`, {
          method: "DELETE",
          headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
        }),
        t("settings.archive.deleteFailed")
      )
      setRemovedSessionIds((current) => new Set(current).add(sessionId))
      deleted = true
      router.refresh()
      toast.success(t("settings.archive.deleted"))
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      focusAfterOperationRef.current = {
        sessionId: deleted ? successFocusTarget : sessionId,
        operation: "delete",
      }
      setWorking(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const sessionId = pendingDelete.id
    const successFocusTarget = nextArchiveFocusTarget(
      sessions.map((session) => session.id),
      sessionId
    )
    setPendingDelete(null)
    await deleteSession(sessionId, successFocusTarget)
  }

  if (!sessions.length) {
    return (
      <div
        ref={emptyStateRef}
        role="status"
        tabIndex={-1}
        className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground outline-none"
      >
        {t("settings.archive.empty")}
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {sessions.map((session) => {
        const title = displaySessionTitle(session, sessionTitleFallback)
        const restoringThis =
          working?.sessionId === session.id && working.operation === "restore"
        const deletingThis =
          working?.sessionId === session.id && working.operation === "delete"
        return (
          <Card key={session.id}>
            <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 sm:flex-1">
                <CardTitle className="truncate">
                  <ArchiveIcon className="mr-2 inline-block size-4 text-muted-foreground" />
                  {title}
                </CardTitle>
                <CardDescription className="mt-1">
                  {session.projectName ?? t("settings.archive.independentTask")}{" "}
                  · {t("settings.archive.archivedAt")}{" "}
                  {formatTimestamp(
                    session.archivedAt ?? session.updatedAt,
                    locale
                  )}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Button
                  ref={(button) => {
                    if (button)
                      restoreButtonRefs.current.set(session.id, button)
                    else restoreButtonRefs.current.delete(session.id)
                  }}
                  variant="secondary"
                  size="sm"
                  disabled={working !== null}
                  aria-busy={restoringThis}
                  aria-label={t(
                    restoringThis
                      ? "settings.archive.restoringSession"
                      : "settings.archive.restoreSession",
                    { title }
                  )}
                  onClick={() => void restoreSession(session.id)}
                >
                  {restoringThis ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <RotateCcwIcon />
                  )}
                  {t(
                    restoringThis
                      ? "settings.archive.restoring"
                      : "settings.archive.restore"
                  )}
                </Button>
                <Button
                  ref={(button) => {
                    if (button) deleteButtonRefs.current.set(session.id, button)
                    else deleteButtonRefs.current.delete(session.id)
                  }}
                  variant="outline"
                  size="sm"
                  disabled={working !== null}
                  aria-busy={deletingThis}
                  aria-label={t(
                    deletingThis
                      ? "settings.archive.deletingSession"
                      : "settings.archive.deleteSession",
                    { title }
                  )}
                  onClick={() => setPendingDelete(session)}
                >
                  {deletingThis ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : (
                    <Trash2Icon />
                  )}
                  {t(
                    deletingThis
                      ? "settings.archive.deleting"
                      : "settings.archive.delete"
                  )}
                </Button>
              </div>
            </CardHeader>
          </Card>
        )
      })}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={t("settings.archive.confirmDeleteTitle")}
        description={
          pendingDelete
            ? t("settings.archive.confirmDelete", {
                title: displaySessionTitle(pendingDelete, sessionTitleFallback),
              })
            : ""
        }
        cancelLabel={t("settings.archive.cancel")}
        confirmLabel={t("settings.archive.delete")}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

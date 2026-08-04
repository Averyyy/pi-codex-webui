"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArchiveIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react"
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
import { nextArchiveFocusTarget } from "@/lib/archive-focus"
import { displaySessionTitle, formatTimestamp } from "@/lib/session-display"
import type { ArchivedSession } from "@/lib/session-types"

export function ArchivedSessions({
  initial,
  mutationToken,
}: {
  initial: ArchivedSession[]
  mutationToken: string
}) {
  const router = useRouter()
  const { t } = useI18n()
  const [deletedSessionIds, setDeletedSessionIds] = useState<Set<string>>(
    () => new Set()
  )
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ArchivedSession | null>(
    null
  )
  const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const emptyStateRef = useRef<HTMLDivElement>(null)
  const focusAfterOperationRef = useRef<string | null | undefined>(undefined)

  const sessions = initial.filter(
    (session) => !deletedSessionIds.has(session.id)
  )

  useLayoutEffect(() => {
    if (deleting !== null) return

    const focusTarget = focusAfterOperationRef.current
    if (focusTarget === undefined) return
    focusAfterOperationRef.current = undefined
    if (focusTarget === null) emptyStateRef.current?.focus()
    else deleteButtonRefs.current.get(focusTarget)?.focus()
  }, [deletedSessionIds, deleting])

  async function deleteSession(
    sessionId: string,
    successFocusTarget: string | null
  ) {
    setDeleting(sessionId)
    let deleted = false
    try {
      const response = await fetch(`/api/v1/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { "X-Pi-Web-Codex-Mutation-Token": mutationToken },
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(result.error ?? t("settings.archive.deleteFailed"))
      }
      setDeletedSessionIds((current) => new Set(current).add(sessionId))
      deleted = true
      router.refresh()
      toast.success(t("settings.archive.deleted"))
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : String(failure))
    } finally {
      focusAfterOperationRef.current = deleted ? successFocusTarget : sessionId
      setDeleting(null)
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
        const title = displaySessionTitle(session)
        const deletingThis = deleting === session.id
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
                  {formatTimestamp(session.archivedAt ?? session.updatedAt)}
                </CardDescription>
              </div>
              <Button
                ref={(button) => {
                  if (button) deleteButtonRefs.current.set(session.id, button)
                  else deleteButtonRefs.current.delete(session.id)
                }}
                variant="outline"
                size="sm"
                className="sm:shrink-0"
                disabled={deleting !== null}
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
                title: displaySessionTitle(pendingDelete),
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

"use client"

import { useRef, useState, type RefObject } from "react"
import {
  CornerDownRightIcon,
  ListEndIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import type { QueuedPromptItem } from "@workspace/runtime-protocol"

import { useI18n } from "@/components/i18n-provider"

export function PromptQueue({
  items,
  onReplace,
  disabled = false,
  fallbackFocusRef,
}: {
  items: QueuedPromptItem[]
  onReplace: (next: QueuedPromptItem[]) => Promise<void>
  disabled?: boolean
  fallbackFocusRef: RefObject<HTMLTextAreaElement | null>
}) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<QueuedPromptItem | null>(null)
  const [editText, setEditText] = useState("")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const updatingRef = useRef(false)
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>())
  const editingTriggerId = useRef<string | null>(null)

  const editingStillQueued = editing
    ? items.some((item) => item.id === editing.id)
    : false

  if (items.length === 0 && editing === null) return null

  async function replace(next: QueuedPromptItem[], itemId: string) {
    if (updatingRef.current) return false
    updatingRef.current = true
    setUpdatingId(itemId)
    try {
      await onReplace(next)
      return true
    } catch {
      return false
    } finally {
      updatingRef.current = false
      setUpdatingId(null)
    }
  }

  function openEditor(item: QueuedPromptItem) {
    editingTriggerId.current = item.id
    setEditing(item)
    setEditText(item.text)
  }

  async function remove(item: QueuedPromptItem, index: number) {
    const next = items.filter((queued) => queued.id !== item.id)
    if (!(await replace(next, item.id))) return
    const nextFocusId = items[index + 1]?.id ?? items[index - 1]?.id
    window.requestAnimationFrame(() => {
      const nextButton = nextFocusId
        ? editButtonRefs.current.get(nextFocusId)
        : undefined
      const focusTarget = nextButton ?? fallbackFocusRef.current
      focusTarget?.focus()
    })
  }

  async function saveEdit() {
    if (!editing || !editingStillQueued || !editText.trim()) return
    const saved = await replace(
      items.map((item) =>
        item.id === editing.id ? { ...item, text: editText.trim() } : item
      ),
      editing.id
    )
    if (saved) setEditing(null)
  }

  return (
    <>
      {items.length ? (
        <Card size="sm" aria-label={t("session.queue.title")}>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ListEndIcon aria-hidden="true" />
              {t("session.queue.title")}
            </CardTitle>
            <CardDescription>
              {t(
                items.length === 1
                  ? "session.queue.descriptionOne"
                  : "session.queue.description",
                { count: items.length }
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {items.map((item, index) => {
              const steering = item.mode === "steer"
              const itemDisabled = disabled || updatingId !== null
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5",
                    steering && "bg-accent"
                  )}
                >
                  <Badge variant={steering ? "secondary" : "outline"}>
                    {steering
                      ? t("session.queue.steering")
                      : t("session.queue.queued")}
                  </Badge>
                  <p
                    className="min-w-0 flex-1 truncate text-sm"
                    title={item.text.slice(0, 200)}
                  >
                    {item.text}
                  </p>
                  {!steering ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={itemDisabled}
                      onClick={() =>
                        void replace(
                          items.map((queued) =>
                            queued.id === item.id
                              ? { ...queued, mode: "steer" }
                              : queued
                          ),
                          item.id
                        )
                      }
                    >
                      <CornerDownRightIcon data-icon="inline-start" />
                      {t("session.queue.steer")}
                    </Button>
                  ) : null}
                  <Button
                    ref={(node) => {
                      if (node) editButtonRefs.current.set(item.id, node)
                      else editButtonRefs.current.delete(item.id)
                    }}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("session.queue.editAria", {
                      index: index + 1,
                    })}
                    disabled={itemDisabled}
                    onClick={() => openEditor(item)}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("session.queue.deleteAria", {
                      index: index + 1,
                    })}
                    disabled={itemDisabled}
                    onClick={() => void remove(item, index)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={editing !== null && editingStillQueued}
        onOpenChange={(open) => {
          if (!open && !updatingRef.current) setEditing(null)
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            const itemId = editingTriggerId.current
            const trigger = itemId
              ? editButtonRefs.current.get(itemId)
              : undefined
            const focusTarget = trigger ?? fallbackFocusRef.current
            focusTarget?.focus()
            editingTriggerId.current = null
            setEditing(null)
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("session.queue.editTitle")}</DialogTitle>
            <DialogDescription>
              {t("session.queue.editDescription")}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!editingStillQueued}>
              <FieldLabel htmlFor="queued-message-text">
                {t("session.queue.message")}
              </FieldLabel>
              <Textarea
                id="queued-message-text"
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                maxLength={100_000}
                aria-invalid={!editingStillQueued}
                className="min-h-28"
                autoFocus
              />
              {!editingStillQueued ? (
                <FieldDescription>
                  {t("session.queue.noLongerAvailable")}
                </FieldDescription>
              ) : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={updatingId !== null}
              onClick={() => setEditing(null)}
            >
              {t("session.queue.cancel")}
            </Button>
            <Button
              type="button"
              disabled={
                disabled ||
                updatingId !== null ||
                !editingStillQueued ||
                !editText.trim()
              }
              onClick={() => void saveEdit()}
            >
              {t("session.queue.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

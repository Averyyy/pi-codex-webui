"use client"

import { useState } from "react"
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

export function PromptQueue({
  items,
  onReplace,
  disabled = false,
}: {
  items: QueuedPromptItem[]
  onReplace: (next: QueuedPromptItem[]) => Promise<void>
  disabled?: boolean
}) {
  const [editing, setEditing] = useState<QueuedPromptItem | null>(null)
  const [editText, setEditText] = useState("")
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  if (items.length === 0) return null

  const editingStillQueued = editing
    ? items.some((item) => item.id === editing.id)
    : false

  async function replace(next: QueuedPromptItem[], itemId: string) {
    setUpdatingId(itemId)
    try {
      await onReplace(next)
      return true
    } catch {
      return false
    } finally {
      setUpdatingId(null)
    }
  }

  function openEditor(item: QueuedPromptItem) {
    setEditing(item)
    setEditText(item.text)
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
      <Card size="sm" aria-label="待处理消息">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <ListEndIcon aria-hidden="true" />
            待处理消息
          </CardTitle>
          <CardDescription>
            {items.length} 条消息将按发送顺序处理
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
                  {steering ? "引导中" : "排队"}
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
                    引导
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`编辑第 ${index + 1} 条待处理消息`}
                  disabled={itemDisabled}
                  onClick={() => openEditor(item)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`删除第 ${index + 1} 条待处理消息`}
                  disabled={itemDisabled}
                  onClick={() =>
                    void replace(
                      items.filter((queued) => queued.id !== item.id),
                      item.id
                    )
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null && editingStillQueued}
        onOpenChange={(open) => {
          if (!open && updatingId === null) setEditing(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑待处理消息</DialogTitle>
            <DialogDescription>
              保存后仍保留这条消息原来的排队或引导状态。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!editingStillQueued}>
              <FieldLabel htmlFor="queued-message-text">消息内容</FieldLabel>
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
                  这条消息已经被处理，不能再编辑。
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
              取消
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
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

"use client"

import { useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PencilIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import { responseJson } from "@/lib/api-response"
import type { TranscriptEntry, TranscriptPart } from "@/lib/session-types"

type UserMessageEntry = Extract<TranscriptEntry, { kind: "message" }>

export function UserMessage({
  entry,
  sessionId,
  mutationToken,
  interactionDisabled,
  children,
}: {
  entry: UserMessageEntry
  sessionId: string
  mutationToken: string
  interactionDisabled: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState("")
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messageText = entry.parts
    .filter(
      (part): part is Extract<TranscriptPart, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("")
  const editable =
    messageText.trim().length > 0 &&
    entry.parts.every((part) => part.type === "text" || part.type === "image")

  async function navigateBranch(entryId: string | undefined) {
    if (!entryId || working || interactionDisabled) return
    setWorking(true)
    setError(null)
    try {
      await responseJson(
        await fetch(`/api/v1/sessions/${sessionId}/tree`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({ entryId, summarize: false }),
        })
      )
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(false)
    }
  }

  async function submitEdit() {
    const message = editValue.trim()
    if (!message || working || interactionDisabled) return
    setWorking(true)
    setError(null)
    try {
      await responseJson(
        await fetch(`/api/v1/sessions/${sessionId}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({
            message,
            images: entry.parts.flatMap((part) =>
              part.type === "image"
                ? [
                    {
                      type: "image" as const,
                      data: part.data,
                      mimeType: part.mimeType,
                    },
                  ]
                : []
            ),
            streamingBehavior: "followUp",
            editEntryId: entry.id,
          }),
        })
      )
      setEditing(false)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(false)
    }
  }

  return (
    <article
      id={`entry-${entry.id}`}
      className={
        editing
          ? "group ml-auto flex w-full max-w-[88%] min-w-0 flex-col items-end gap-1 [contain-intrinsic-size:auto_5rem] [content-visibility:auto]"
          : "group ml-auto flex w-fit max-w-[88%] min-w-0 flex-col items-end gap-1 [contain-intrinsic-size:auto_5rem] [content-visibility:auto]"
      }
    >
      <div className="flex w-full min-w-0 flex-col gap-2 rounded-2xl bg-muted px-3.5 py-2.5">
        {editing ? (
          <>
            <Textarea
              value={editValue}
              onChange={(event) => setEditValue(event.target.value)}
              aria-label="编辑已发送消息"
              className="min-h-24 resize-y border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              autoFocus
              disabled={working}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false)
                  setError(null)
                }}
                disabled={working}
              >
                取消
              </Button>
              <Button
                onClick={() => void submitEdit()}
                disabled={!editValue.trim() || working || interactionDisabled}
              >
                {working ? <LoaderCircleIcon className="animate-spin" /> : null}
                发送
              </Button>
            </div>
          </>
        ) : (
          children
        )}
      </div>
      {!editing ? (
        <div
          className={
            entry.branch
              ? "flex min-h-7 items-center gap-0.5"
              : "flex min-h-7 items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
          }
        >
          {entry.branch ? (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="上一条消息分支"
                onClick={() =>
                  void navigateBranch(entry.branch?.previousEntryId)
                }
                disabled={
                  working ||
                  interactionDisabled ||
                  !entry.branch.previousEntryId
                }
              >
                <ChevronLeftIcon />
              </Button>
              <span className="min-w-8 text-center text-xs text-muted-foreground tabular-nums">
                {entry.branch.index}/{entry.branch.total}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="下一条消息分支"
                onClick={() => void navigateBranch(entry.branch?.nextEntryId)}
                disabled={
                  working || interactionDisabled || !entry.branch.nextEntryId
                }
              >
                <ChevronRightIcon />
              </Button>
            </>
          ) : null}
          {editable ? (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="编辑消息"
              onClick={() => {
                setEditValue(messageText)
                setEditing(true)
                setError(null)
              }}
              disabled={working || interactionDisabled}
            >
              <PencilIcon />
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </article>
  )
}

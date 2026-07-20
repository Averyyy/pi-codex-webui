"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Dialog, DialogContent } from "@workspace/ui/components/dialog"
import type { SessionTree } from "@workspace/runtime-protocol"

import { SessionTreeDialog } from "@/components/session-tree-dialog"
import { responseJson } from "@/lib/api-response"
import { sessionTreeCurrentEntryId } from "@/lib/session-tree"

export function SessionTreeViewer({
  open,
  ...props
}: {
  sessionId: string
  mutationToken: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null

  return <SessionTreeViewerDialog open={open} {...props} />
}

function SessionTreeViewerDialog({
  sessionId,
  mutationToken,
  open,
  onOpenChange,
}: {
  sessionId: string
  mutationToken: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [tree, setTree] = useState<SessionTree | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState("")
  const [summarize, setSummarize] = useState(false)
  const [working, setWorking] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const treePath = "/api/v1/sessions/" + sessionId + "/tree"

  useEffect(() => {
    if (!open) return

    let active = true

    void fetch(treePath, { cache: "no-store" })
      .then(responseJson<SessionTree>)
      .then((result) => {
        if (!active) return
        setTree(result)
        setSelectedEntryId(sessionTreeCurrentEntryId(result) ?? "")
      })
      .catch((failure: unknown) => {
        if (!active) return
        setError(failure instanceof Error ? failure.message : String(failure))
      })
      .finally(() => {
        if (active) setWorking(false)
      })

    return () => {
      active = false
    }
  }, [open, treePath])

  async function navigateTree() {
    if (!selectedEntryId) return

    setWorking(true)
    setError(null)
    try {
      await responseJson(
        await fetch(treePath, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({
            entryId: selectedEntryId,
            summarize,
          }),
        })
      )
      onOpenChange(false)
      router.refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen || !working) onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="flex h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-[56rem] flex-col gap-0 overflow-hidden p-0 sm:h-[min(44rem,calc(100svh-2rem))] sm:max-w-[56rem]">
        <SessionTreeDialog
          tree={tree}
          selectedEntryId={selectedEntryId}
          onSelectedEntryIdChange={setSelectedEntryId}
          summarize={summarize}
          onSummarizeChange={setSummarize}
          working={working}
          error={error}
          onCancel={() => onOpenChange(false)}
          onNavigate={() => void navigateTree()}
        />
      </DialogContent>
    </Dialog>
  )
}

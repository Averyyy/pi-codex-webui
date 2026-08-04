"use client"

import { useEffect, useState, type RefObject } from "react"
import { useRouter } from "next/navigation"

import { Dialog, DialogContent } from "@workspace/ui/components/dialog"
import type { SessionTree } from "@workspace/runtime-protocol"

import { SessionTreeDialog } from "@/components/session-tree-dialog"
import { responseJson } from "@/lib/api-response"
import { sessionTreeCurrentEntryId } from "@/lib/session-tree"

export function SessionTreeViewer({
  sessionId,
  mutationToken,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  sessionId: string
  mutationToken: string
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLElement | null>
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

  function closeViewer() {
    setTree(null)
    setSelectedEntryId("")
    setSummarize(false)
    setWorking(true)
    setError(null)
    onOpenChange(false)
  }

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
      closeViewer()
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
        if (nextOpen) onOpenChange(true)
        else if (!working) closeViewer()
      }}
    >
      <DialogContent
        className="flex h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-[56rem] flex-col gap-0 overflow-hidden p-0 sm:h-[min(44rem,calc(100svh-2rem))] sm:max-w-[56rem]"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
      >
        <SessionTreeDialog
          tree={tree}
          selectedEntryId={selectedEntryId}
          onSelectedEntryIdChange={setSelectedEntryId}
          summarize={summarize}
          onSummarizeChange={setSummarize}
          working={working}
          error={error}
          onCancel={closeViewer}
          onNavigate={() => void navigateTree()}
        />
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useLayoutEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { z } from "zod"
import {
  ArchiveIcon,
  BarChart3Icon,
  CopyIcon,
  DownloadIcon,
  GitForkIcon,
  GitMergeIcon,
  ImportIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Repeat2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { FieldError } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  sessionStatsSchema,
  sessionTreeSchema,
  type RuntimeStatus,
  type SessionStats,
  type SessionTree,
} from "@workspace/runtime-protocol"

import { SessionTreeViewer } from "@/components/session-tree-viewer"
import { useI18n } from "@/components/i18n-provider"
import { useShortcutAction } from "@/components/keyboard-shortcuts-provider"
import { useStreamingRuntimeStatus } from "@/components/session-streaming-context"
import { responseJson, validatedResponseJson } from "@/lib/api-response"
import { sessionTreeActiveUserEntryId } from "@/lib/session-tree"

type DialogKind = "rename" | "fork" | "stats" | "import" | "runtime"

interface ReplacementResult {
  projectId: string | null
  sessionId: string
}

const replacementResultSchema = z.object({
  projectId: z.string().nullable(),
  sessionId: z.string().min(1),
})

function treeLabel(entry: SessionTree["entries"][number], locale: string) {
  const label = entry.label ?? entry.text ?? entry.role ?? entry.type
  return `${label} · ${new Date(entry.timestamp).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export function SessionOperations({
  sessionId,
  projectId,
  title,
  isPinned,
  mutationToken,
  runtimeProfileId,
  runtimeProfiles,
  initialRuntimeStatus,
}: {
  sessionId: string
  projectId: string | null
  title: string
  isPinned: boolean
  mutationToken: string
  runtimeProfileId: string
  runtimeProfiles: Array<{ id: string; label: string }>
  initialRuntimeStatus: RuntimeStatus
}) {
  const { locale, t } = useI18n()
  const router = useRouter()
  const operationsTriggerRef = useRef<HTMLButtonElement>(null)
  const treeTriggerRef = useRef<HTMLButtonElement>(null)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [name, setName] = useState(title)
  const [tree, setTree] = useState<SessionTree | null>(null)
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState("")
  const [treeOpen, setTreeOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const runtimeTargets = runtimeProfiles.filter(
    (profile) => profile.id !== runtimeProfileId
  )
  const [selectedRuntimeProfileId, setSelectedRuntimeProfileId] = useState(
    runtimeTargets[0]?.id ?? ""
  )
  const [working, setWorking] = useState(false)
  const workingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const focusErrorRef = useRef(false)
  const runtimeStatus = useStreamingRuntimeStatus() ?? initialRuntimeStatus
  const runtimeOperationDisabled = [
    "starting",
    "busy",
    "stopping",
    "crashed",
  ].includes(runtimeStatus)

  const mutationHeaders = {
    "X-Pi-Web-Codex-Mutation-Token": mutationToken,
  }

  useLayoutEffect(() => {
    if (working || !error || !focusErrorRef.current) return
    focusErrorRef.current = false
    errorRef.current?.focus()
  }, [error, working])

  async function mutate<T = unknown>(
    path: string,
    body?: unknown,
    parse?: (value: unknown) => T
  ) {
    const response = await fetch(path, {
      method: "POST",
      headers:
        body === undefined
          ? mutationHeaders
          : { ...mutationHeaders, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return parse
      ? validatedResponseJson(
          response,
          parse,
          t("session.operations.invalidResponse")
        )
      : responseJson<T>(
          response,
          t("session.runtime.operationFailed", { status: response.status })
        )
  }

  function navigateTo(result: ReplacementResult) {
    setDialog(null)
    setFile(null)
    router.push(
      result.projectId === null
        ? `/tasks/${result.sessionId}`
        : `/projects/${result.projectId}/sessions/${result.sessionId}`
    )
    router.refresh()
  }

  function openDialog(next: DialogKind) {
    if (workingRef.current) return
    setError(null)
    if (next === "rename") setName(title)
    if (next === "import") setFile(null)
    setDialog(next)
  }

  function beginWorking() {
    if (workingRef.current) return false
    workingRef.current = true
    setWorking(true)
    return true
  }

  function finishWorking() {
    workingRef.current = false
    setWorking(false)
  }

  async function run(
    operation: () => Promise<void>,
    options: { dialogError?: boolean } = {}
  ) {
    if (!beginWorking()) return
    setError(null)
    try {
      await operation()
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure)
      if (options.dialogError) {
        focusErrorRef.current = true
        setError(message)
      } else {
        toast.error(message)
      }
    } finally {
      finishWorking()
    }
  }

  async function openFork() {
    if (!beginWorking()) return
    setDialog("fork")
    setTree(null)
    setSelectedEntryId("")
    setError(null)
    try {
      const result = await validatedResponseJson(
        await fetch(`/api/v1/sessions/${sessionId}/tree`, {
          cache: "no-store",
        }),
        sessionTreeSchema.parse,
        t("session.operations.invalidResponse")
      )
      setTree(result)
      setSelectedEntryId(sessionTreeActiveUserEntryId(result) ?? "")
    } catch (failure) {
      focusErrorRef.current = true
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      finishWorking()
    }
  }

  async function openStats() {
    if (!beginWorking()) return
    setDialog("stats")
    setStats(null)
    setError(null)
    try {
      setStats(
        await validatedResponseJson(
          await fetch(`/api/v1/sessions/${sessionId}/stats`, {
            cache: "no-store",
          }),
          sessionStatsSchema.parse,
          t("session.operations.invalidResponse")
        )
      )
    } catch (failure) {
      focusErrorRef.current = true
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      finishWorking()
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(
      async () => {
        const response = await fetch(`/api/v1/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { ...mutationHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
        await responseJson(
          response,
          t("session.runtime.operationFailed", { status: response.status })
        )
        setDialog(null)
        router.refresh()
      },
      { dialogError: true }
    )
  }

  async function archive() {
    await run(async () => {
      await mutate(`/api/v1/sessions/${sessionId}/archive`)
      router.push("/")
      router.refresh()
    })
  }

  async function togglePin() {
    await run(async () => {
      await mutate(`/api/v1/sessions/${sessionId}/pin`, {
        pinned: !isPinned,
      })
      router.refresh()
    })
  }

  function startNewConversation() {
    router.push(
      projectId === null
        ? "/new"
        : `/new?projectId=${encodeURIComponent(projectId)}`
    )
  }

  async function clone() {
    await run(async () => {
      navigateTo(
        await mutate(
          `/api/v1/sessions/${sessionId}/clone`,
          undefined,
          replacementResultSchema.parse
        )
      )
    })
  }

  async function duplicateIntoRuntime() {
    if (!selectedRuntimeProfileId) return
    await run(
      async () => {
        navigateTo(
          await mutate(
            `/api/v1/sessions/${sessionId}/duplicate-runtime`,
            { runtimeProfileId: selectedRuntimeProfileId },
            replacementResultSchema.parse
          )
        )
      },
      { dialogError: true }
    )
  }

  async function fork() {
    if (!selectedEntryId) return
    await run(
      async () => {
        navigateTo(
          await mutate(
            `/api/v1/sessions/${sessionId}/fork`,
            {
              entryId: selectedEntryId,
              position: "at",
            },
            replacementResultSchema.parse
          )
        )
      },
      { dialogError: true }
    )
  }

  async function exportSession(format: "jsonl" | "html") {
    await run(async () => {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/export?format=${format}`,
        { cache: "no-store" }
      )
      if (!response.ok) {
        await responseJson(response, t("session.operations.exportFailed"))
        return
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = `pi-session-${sessionId}.${format}`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    })
  }

  async function importSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    await run(
      async () => {
        const body = new FormData()
        body.set("file", file)
        navigateTo(
          await validatedResponseJson(
            await fetch(`/api/v1/sessions/${sessionId}/import`, {
              method: "POST",
              headers: mutationHeaders,
              body,
            }),
            replacementResultSchema.parse,
            t("session.operations.invalidResponse")
          )
        )
      },
      { dialogError: true }
    )
  }

  const forkEntries = tree?.entries.filter((entry) => entry.role === "user")

  useShortcutAction("conversation.archive", () => void archive(), !working)
  useShortcutAction("conversation.togglePin", () => void togglePin(), !working)
  useShortcutAction(
    "conversation.rename",
    () => openDialog("rename"),
    !working && !runtimeOperationDisabled
  )
  useShortcutAction(
    "conversation.continue",
    () => void clone(),
    !working && !runtimeOperationDisabled
  )

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={treeTriggerRef}
            variant="ghost"
            size="icon"
            aria-label={t("session.operations.tree")}
            aria-haspopup="dialog"
            disabled={working || runtimeOperationDisabled}
            onClick={() => setTreeOpen(true)}
          >
            <GitMergeIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {t("session.operations.tree")}
        </TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={operationsTriggerRef}
            variant="ghost"
            size="icon"
            aria-label={t("session.operations.menu")}
            disabled={working}
          >
            {working ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <MoreHorizontalIcon />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={startNewConversation}>
            <PlusIcon /> {t("session.operations.new")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={runtimeOperationDisabled}
            onSelect={() => openDialog("rename")}
          >
            <PencilIcon /> {t("session.operations.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={runtimeOperationDisabled}
            onSelect={clone}
          >
            <CopyIcon /> {t("session.operations.clone")}
          </DropdownMenuItem>
          {runtimeTargets.length ? (
            <DropdownMenuItem
              disabled={runtimeOperationDisabled}
              onSelect={() => openDialog("runtime")}
            >
              <Repeat2Icon /> {t("session.operations.duplicateRuntime")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            disabled={runtimeOperationDisabled}
            onSelect={() => void openFork()}
          >
            <GitForkIcon /> {t("session.operations.fork")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={runtimeOperationDisabled}
            onSelect={() => void exportSession("jsonl")}
          >
            <DownloadIcon /> {t("session.operations.exportJsonl")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={runtimeOperationDisabled}
            onSelect={() => void exportSession("html")}
          >
            <DownloadIcon /> {t("session.operations.exportHtml")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={runtimeOperationDisabled}
            onSelect={() => openDialog("import")}
          >
            <ImportIcon /> {t("session.operations.importJsonl")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={runtimeOperationDisabled}
            onSelect={openStats}
          >
            <BarChart3Icon /> {t("session.operations.stats")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void archive()}>
            <ArchiveIcon /> {t("session.operations.archive")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SessionTreeViewer
        sessionId={sessionId}
        mutationToken={mutationToken}
        open={treeOpen}
        onOpenChange={setTreeOpen}
        returnFocusRef={treeTriggerRef}
      />

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !workingRef.current) setDialog(null)
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            operationsTriggerRef.current?.focus()
          }}
        >
          {dialog === "rename" ? (
            <form className="grid gap-5" onSubmit={rename}>
              <DialogHeader>
                <DialogTitle>{t("session.operations.renameTitle")}</DialogTitle>
                <DialogDescription>
                  {t("session.operations.renameDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="session-rename-name">
                  {t("session.operations.name")}
                </Label>
                <Input
                  id="session-rename-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={200}
                  autoFocus
                  disabled={working || runtimeOperationDisabled}
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={working || runtimeOperationDisabled || !name.trim()}
                >
                  {t("session.operations.save")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {dialog === "fork" ? (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>{t("session.operations.forkTitle")}</DialogTitle>
                <DialogDescription>
                  {t("session.operations.forkDescription")}
                </DialogDescription>
              </DialogHeader>
              {forkEntries?.length ? (
                <Select
                  value={selectedEntryId}
                  onValueChange={setSelectedEntryId}
                  disabled={working || runtimeOperationDisabled}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t("session.operations.entry")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {forkEntries.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {treeLabel(entry, locale)}
                        {entry.id === tree?.leafId
                          ? ` · ${t("session.operations.current")}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <DialogFooter>
                <Button
                  onClick={fork}
                  disabled={
                    working || runtimeOperationDisabled || !selectedEntryId
                  }
                >
                  {working ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : null}
                  {t("session.operations.createFork")}
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {dialog === "stats" ? (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>{t("session.operations.statsTitle")}</DialogTitle>
                <DialogDescription>
                  {t("session.operations.statsDescription")}
                </DialogDescription>
              </DialogHeader>
              {working ? (
                <div className="grid min-h-28 place-items-center">
                  <LoaderCircleIcon className="animate-spin text-muted-foreground" />
                </div>
              ) : stats ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.userMessages")}
                    </dt>
                    <dd className="text-lg font-medium">
                      {stats.userMessages.toLocaleString(locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.assistantMessages")}
                    </dt>
                    <dd className="text-lg font-medium">
                      {stats.assistantMessages.toLocaleString(locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.toolCalls")}
                    </dt>
                    <dd className="text-lg font-medium">
                      {stats.toolCalls.toLocaleString(locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.tokens")}
                    </dt>
                    <dd className="text-lg font-medium">
                      {stats.tokens.total.toLocaleString(locale)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.cost")}
                    </dt>
                    <dd className="text-lg font-medium">
                      {stats.cost.toLocaleString(locale, {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })}
                    </dd>
                  </div>
                  {stats.contextUsage ? (
                    <div>
                      <dt className="text-muted-foreground">
                        {t("session.operations.context")}
                      </dt>
                      <dd className="text-lg font-medium">
                        {stats.contextUsage.percent === null
                          ? "—"
                          : (stats.contextUsage.percent / 100).toLocaleString(
                              locale,
                              {
                                style: "percent",
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              }
                            )}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </div>
          ) : null}

          {dialog === "runtime" ? (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>
                  {t("session.operations.runtimeTitle")}
                </DialogTitle>
                <DialogDescription>
                  {t("session.operations.runtimeDescription")}
                </DialogDescription>
              </DialogHeader>
              <Select
                value={selectedRuntimeProfileId}
                onValueChange={setSelectedRuntimeProfileId}
                disabled={working || runtimeOperationDisabled}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t("session.operations.targetRuntime")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {runtimeTargets.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button
                  onClick={duplicateIntoRuntime}
                  disabled={
                    working ||
                    runtimeOperationDisabled ||
                    !selectedRuntimeProfileId
                  }
                >
                  {working ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : null}
                  {t("session.operations.createCopy")}
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {dialog === "import" ? (
            <form className="grid gap-5" onSubmit={importSession}>
              <DialogHeader>
                <DialogTitle>{t("session.operations.importTitle")}</DialogTitle>
                <DialogDescription>
                  {t("session.operations.importDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor="session-import-file">
                  {t("session.operations.importFile")}
                </Label>
                <Input
                  id="session-import-file"
                  type="file"
                  accept=".jsonl,application/x-ndjson"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={working || runtimeOperationDisabled}
                />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={working || runtimeOperationDisabled || !file}
                >
                  {working ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : null}
                  {t("session.operations.import")}
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {error ? (
            <FieldError ref={errorRef} tabIndex={-1}>
              {error}
            </FieldError>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

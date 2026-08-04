"use client"

import { useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
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
import type {
  RuntimeStatus,
  SessionStats,
  SessionTree,
} from "@workspace/runtime-protocol"

import { SessionTreeViewer } from "@/components/session-tree-viewer"
import { useI18n } from "@/components/i18n-provider"
import { useStreamingRuntimeStatus } from "@/components/session-streaming-context"
import { responseJson } from "@/lib/api-response"

type DialogKind = "rename" | "fork" | "stats" | "import" | "runtime"

interface ReplacementResult {
  projectId: string | null
  sessionId: string
}

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
  mutationToken,
  runtimeProfileId,
  runtimeProfiles,
  initialRuntimeStatus,
}: {
  sessionId: string
  projectId: string | null
  title: string
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
  const [error, setError] = useState<string | null>(null)
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

  async function mutate<T>(path: string, body?: unknown) {
    return responseJson<T>(
      await fetch(path, {
        method: "POST",
        headers:
          body === undefined
            ? mutationHeaders
            : { ...mutationHeaders, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
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
    setError(null)
    if (next === "rename") setName(title)
    if (next === "import") setFile(null)
    setDialog(next)
  }

  async function run(operation: () => Promise<void>) {
    setWorking(true)
    setError(null)
    try {
      await operation()
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : String(failure)
      setError(message)
      if (!dialog) toast.error(message)
    } finally {
      setWorking(false)
    }
  }

  async function openFork() {
    setDialog("fork")
    setTree(null)
    setSelectedEntryId("")
    setWorking(true)
    setError(null)
    try {
      const result = await responseJson<SessionTree>(
        await fetch(`/api/v1/sessions/${sessionId}/tree`, {
          cache: "no-store",
        })
      )
      setTree(result)
      setSelectedEntryId(
        result.entries.filter((entry) => entry.role === "user").at(-1)?.id ?? ""
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(false)
    }
  }

  async function openStats() {
    setDialog("stats")
    setStats(null)
    setWorking(true)
    setError(null)
    try {
      setStats(
        await responseJson<SessionStats>(
          await fetch(`/api/v1/sessions/${sessionId}/stats`, {
            cache: "no-store",
          })
        )
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(false)
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await run(async () => {
      await responseJson(
        await fetch(`/api/v1/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { ...mutationHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        })
      )
      setDialog(null)
      router.refresh()
    })
  }

  async function archive() {
    await run(async () => {
      await mutate(`/api/v1/sessions/${sessionId}/archive`)
      router.push("/")
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
        await mutate<ReplacementResult>(`/api/v1/sessions/${sessionId}/clone`)
      )
    })
  }

  async function duplicateIntoRuntime() {
    if (!selectedRuntimeProfileId) return
    await run(async () => {
      navigateTo(
        await mutate<ReplacementResult>(
          `/api/v1/sessions/${sessionId}/duplicate-runtime`,
          { runtimeProfileId: selectedRuntimeProfileId }
        )
      )
    })
  }

  async function fork() {
    if (!selectedEntryId) return
    await run(async () => {
      navigateTo(
        await mutate<ReplacementResult>(`/api/v1/sessions/${sessionId}/fork`, {
          entryId: selectedEntryId,
          position: "at",
        })
      )
    })
  }

  async function exportSession(format: "jsonl" | "html") {
    await run(async () => {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/export?format=${format}`,
        { cache: "no-store" }
      )
      if (!response.ok) {
        const result = (await response.json()) as { error?: string }
        throw new Error(result.error ?? t("session.operations.exportFailed"))
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = `pi-session.${format}`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    })
  }

  async function importSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    await run(async () => {
      const body = new FormData()
      body.set("file", file)
      navigateTo(
        await responseJson<ReplacementResult>(
          await fetch(`/api/v1/sessions/${sessionId}/import`, {
            method: "POST",
            headers: mutationHeaders,
            body,
          })
        )
      )
    })
  }

  const forkEntries = tree?.entries.filter((entry) => entry.role === "user")

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
          if (!open && !working) setDialog(null)
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
                      {stats.userMessages}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.assistantMessages")}
                    </dt>
                    <dd className="text-lg font-medium">
                      {stats.assistantMessages}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.toolCalls")}
                    </dt>
                    <dd className="text-lg font-medium">{stats.toolCalls}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.tokens")}
                    </dt>
                    <dd className="text-lg font-medium">
                      {stats.tokens.total.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t("session.operations.cost")}
                    </dt>
                    <dd className="text-lg font-medium">
                      ${stats.cost.toFixed(4)}
                    </dd>
                  </div>
                  {stats.contextUsage ? (
                    <div>
                      <dt className="text-muted-foreground">
                        {t("session.operations.context")}
                      </dt>
                      <dd className="text-lg font-medium">
                        {stats.contextUsage.percent.toFixed(1)}%
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

          {error ? <FieldError>{error}</FieldError> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

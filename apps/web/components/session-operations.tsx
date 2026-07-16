"use client"

import { useState, type FormEvent } from "react"
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
import { Input } from "@workspace/ui/components/input"
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
import type { SessionStats, SessionTree } from "@workspace/runtime-protocol"

import { SessionTreeViewer } from "@/components/session-tree-viewer"

type DialogKind = "rename" | "fork" | "stats" | "import" | "runtime"

interface ReplacementResult {
  projectId: string | null
  sessionId: string
}

async function responseJson<T>(response: Response) {
  const result = (await response.json()) as T & { error?: string }
  if (!response.ok) {
    throw new Error(result.error ?? `操作失败（HTTP ${response.status}）。`)
  }
  return result
}

function treeLabel(entry: SessionTree["entries"][number]) {
  const label = entry.label ?? entry.text ?? entry.role ?? entry.type
  return `${label} · ${new Date(entry.timestamp).toLocaleTimeString("zh-CN", {
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
}: {
  sessionId: string
  projectId: string | null
  title: string
  mutationToken: string
  runtimeProfileId: string
  runtimeProfiles: Array<{ id: string; label: string }>
}) {
  const router = useRouter()
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
        throw new Error(result.error ?? "导出 session 失败。")
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement("a")
      link.href = url
      link.download = `pi-session.${format}`
      link.click()
      URL.revokeObjectURL(url)
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
            variant="ghost"
            size="icon"
            aria-label="Session tree"
            aria-haspopup="dialog"
            onClick={() => setTreeOpen(true)}
          >
            <GitMergeIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Session tree</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Session 操作">
            {working ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <MoreHorizontalIcon />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={startNewConversation}>
            <PlusIcon /> 新对话
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("rename")}>
            <PencilIcon /> 重命名
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={clone}>
            <CopyIcon /> Clone 当前分支
          </DropdownMenuItem>
          {runtimeTargets.length ? (
            <DropdownMenuItem onSelect={() => setDialog("runtime")}>
              <Repeat2Icon /> Duplicate into runtime
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void openFork()}>
            <GitForkIcon /> Fork
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void exportSession("jsonl")}>
            <DownloadIcon /> 导出 JSONL
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportSession("html")}>
            <DownloadIcon /> 导出 HTML
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("import")}>
            <ImportIcon /> 导入 JSONL
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openStats}>
            <BarChart3Icon /> 统计
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void archive()}>
            <ArchiveIcon /> 归档
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SessionTreeViewer
        sessionId={sessionId}
        mutationToken={mutationToken}
        open={treeOpen}
        onOpenChange={setTreeOpen}
      />

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          {dialog === "rename" ? (
            <form className="grid gap-5" onSubmit={rename}>
              <DialogHeader>
                <DialogTitle>重命名 session</DialogTitle>
                <DialogDescription>
                  名称会由 Pi 写入当前 JSONL。
                </DialogDescription>
              </DialogHeader>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoFocus
              />
              <DialogFooter>
                <Button type="submit" disabled={working || !name.trim()}>
                  保存
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {dialog === "fork" ? (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>Fork session</DialogTitle>
                <DialogDescription>
                  从一条真实的用户消息创建新的 Pi session。
                </DialogDescription>
              </DialogHeader>
              {forkEntries?.length ? (
                <Select
                  value={selectedEntryId}
                  onValueChange={setSelectedEntryId}
                >
                  <SelectTrigger className="w-full" aria-label="Session entry">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {forkEntries.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {treeLabel(entry)}
                        {entry.id === tree?.leafId ? " · 当前" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <DialogFooter>
                <Button onClick={fork} disabled={working || !selectedEntryId}>
                  {working ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : null}
                  创建 fork
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {dialog === "stats" ? (
            <div className="grid gap-5">
              <DialogHeader>
                <DialogTitle>Session 统计</DialogTitle>
                <DialogDescription>
                  统计由当前 Pi AgentSession 计算。
                </DialogDescription>
              </DialogHeader>
              {stats ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">用户消息</dt>
                    <dd className="text-lg font-medium">
                      {stats.userMessages}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">助手消息</dt>
                    <dd className="text-lg font-medium">
                      {stats.assistantMessages}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tool calls</dt>
                    <dd className="text-lg font-medium">{stats.toolCalls}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tokens</dt>
                    <dd className="text-lg font-medium">
                      {stats.tokens.total.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">成本</dt>
                    <dd className="text-lg font-medium">
                      ${stats.cost.toFixed(4)}
                    </dd>
                  </div>
                  {stats.contextUsage ? (
                    <div>
                      <dt className="text-muted-foreground">上下文</dt>
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
                <DialogTitle>Duplicate into selected runtime</DialogTitle>
                <DialogDescription>
                  复制当前分支并绑定到目标 runtime；原 session 与绑定保持不变。
                </DialogDescription>
              </DialogHeader>
              <Select
                value={selectedRuntimeProfileId}
                onValueChange={setSelectedRuntimeProfileId}
              >
                <SelectTrigger className="w-full" aria-label="目标 runtime">
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
                  disabled={working || !selectedRuntimeProfileId}
                >
                  {working ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : null}
                  创建副本
                </Button>
              </DialogFooter>
            </div>
          ) : null}

          {dialog === "import" ? (
            <form className="grid gap-5" onSubmit={importSession}>
              <DialogHeader>
                <DialogTitle>导入 Pi JSONL</DialogTitle>
                <DialogDescription>
                  Pi 会校验并创建一个新的 session；当前 session 保持不变。
                </DialogDescription>
              </DialogHeader>
              <Input
                type="file"
                accept=".jsonl,application/x-ndjson"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <DialogFooter>
                <Button type="submit" disabled={working || !file}>
                  {working ? (
                    <LoaderCircleIcon className="animate-spin" />
                  ) : null}
                  导入
                </Button>
              </DialogFooter>
            </form>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

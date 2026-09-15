"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { responseJson } from "@/lib/api-response"
import type {
  ProjectDirectoryListing,
  AddedProject,
} from "@/lib/project-picker-client"
import { useI18n } from "@/components/i18n-provider"
export interface ProjectDirectoryDialogProps {
  token: string
  initialListing: ProjectDirectoryListing
  onClose: (project: AddedProject | null) => void
}
export function ProjectDirectoryDialog({
  token,
  initialListing,
  onClose,
}: ProjectDirectoryDialogProps) {
  const { locale } = useI18n()
  const zh = locale === "zh-CN"
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useRef<AbortController | null>(null)
  const [listing, setListing] =
    useState<ProjectDirectoryListing>(initialListing)
  const [input, setInput] = useState(initialListing.path)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadDirectory = useCallback(
    async (path?: string) => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      try {
        const result = await responseJson<ProjectDirectoryListing>(
          await fetch("/api/v1/projects/pick", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "X-Pi-Web-Codex-Mutation-Token": token,
            },
            body: JSON.stringify({ path }),
          })
        )
        if (!controller.signal.aborted) {
          setListing(result)
          setInput(result.path)
        }
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure))
      } finally {
        if (!controller.signal.aborted) setBusy(false)
      }
    },
    [token]
  )
  function browse(path?: string) {
    setBusy(true)
    setError(null)
    return loadDirectory(path)
  }
  function close(project: AddedProject | null = null) {
    request.current?.abort()
    dialog.current?.close()
    onClose(project)
  }
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => {
      request.current?.abort()
      element?.close()
    }
  }, [])
  async function select() {
    if (!listing || busy || saving) return
    setSaving(true)
    setError(null)
    try {
      const project = await responseJson<AddedProject>(
        await fetch("/api/v1/projects", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": token,
          },
          body: JSON.stringify({ path: listing.path }),
        })
      )
      close(project)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSaving(false)
    }
  }
  return (
    <>
      <dialog
        ref={dialog}
        aria-labelledby="project-picker-title"
        onCancel={(event) => {
          event.preventDefault()
          if (!saving) close()
        }}
        className="fixed inset-0 m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border bg-background p-5 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <h2 id="project-picker-title" className="mb-2 text-lg font-semibold">
          {zh ? "选择项目文件夹" : "Choose project folder"}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {zh
            ? "浏览运行 WebUI 的主机目录，也可输入绝对路径或网络共享路径。"
            : "Browse folders on the WebUI host, or enter an absolute or network share path."}
        </p>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void browse(input)
          }}
        >
          <input
            aria-label={zh ? "文件夹路径" : "Folder path"}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            disabled={saving}
            className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={saving || !input}
            className="rounded-md border px-3"
          >
            {zh ? "前往" : "Go"}
          </button>
        </form>
        <div className="my-3 flex items-center gap-3 text-sm">
          <button
            type="button"
            disabled={busy || saving || !listing?.parent}
            onClick={() => void browse(listing!.parent!)}
            className="rounded border px-3 py-1 disabled:opacity-40"
          >
            {zh ? "上一级" : "Parent"}
          </button>
          {busy ? (
            <span role="status">
              {zh ? "正在读取目录…" : "Loading folders…"}
            </span>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="my-2 text-sm break-words text-destructive">
            {error}
          </p>
        ) : null}
        <div
          aria-busy={busy}
          className="h-64 overflow-auto rounded-md border p-1"
        >
          {!busy && listing?.directories.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {zh ? "没有子文件夹" : "No subfolders"}
            </p>
          ) : null}
          {listing?.directories.map((directory) => (
            <button
              key={directory.path}
              type="button"
              disabled={busy || saving}
              onClick={() => void browse(directory.path)}
              className="block w-full rounded px-3 py-2 text-left text-sm break-all hover:bg-accent focus-visible:bg-accent"
            >
              {directory.name}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => close()}
            className="rounded-md border px-4 py-2 text-sm"
          >
            {zh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={
              busy || saving || !!error || !listing || input !== listing.path
            }
            onClick={() => void select()}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40"
          >
            {saving
              ? zh
                ? "正在添加…"
                : "Adding…"
              : zh
                ? "选择此文件夹"
                : "Select this folder"}
          </button>
        </div>
      </dialog>
    </>
  )
}

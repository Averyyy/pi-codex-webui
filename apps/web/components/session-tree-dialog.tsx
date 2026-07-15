"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  BotIcon,
  GitCommitHorizontalIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
  UserRoundIcon,
  WrenchIcon,
} from "lucide-react"

import type { SessionTree } from "@workspace/runtime-protocol"
import { Button } from "@workspace/ui/components/button"
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { cn } from "@workspace/ui/lib/utils"

import {
  buildSessionTreeRows,
  sessionTreeActiveCount,
  sessionTreeCurrentEntryId,
  sessionTreeEntryCount,
  type SessionTreeFilter,
} from "@/lib/session-tree"

const rowHeight = 46
const treeOrigin = 22
const depthStep = 26

const filters: Array<{ value: SessionTreeFilter; label: string }> = [
  { value: "default", label: "默认" },
  { value: "user", label: "仅用户" },
  { value: "labeled", label: "已标记" },
  { value: "all", label: "全部" },
]

const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
})

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function entryText(entry: SessionTree["entries"][number]) {
  if (entry.text) return compactText(entry.text)
  if (entry.label) return entry.label
  if (entry.role === "user") return "用户消息"
  if (entry.role === "assistant") return "助手回复"
  if (entry.role === "toolResult") return "工具结果"
  if (entry.type === "compaction") return "上下文压缩"
  if (entry.type === "branch_summary") return "分支摘要"
  return entry.type
}

function entryIcon(entry: SessionTree["entries"][number]) {
  if (entry.role === "user") return UserRoundIcon
  if (entry.role === "assistant") return BotIcon
  if (entry.role === "toolResult") return WrenchIcon
  if (entry.label) return TagIcon
  if (entry.type === "message") return MessageSquareIcon
  return GitCommitHorizontalIcon
}

export function SessionTreeDialog({
  tree,
  selectedEntryId,
  onSelectedEntryIdChange,
  summarize,
  onSummarizeChange,
  working,
  error,
  onCancel,
  onNavigate,
}: {
  tree: SessionTree | null
  selectedEntryId: string
  onSelectedEntryIdChange: (entryId: string) => void
  summarize: boolean
  onSummarizeChange: (summarize: boolean) => void
  working: boolean
  error: string | null
  onCancel: () => void
  onNavigate: () => void
}) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<SessionTreeFilter>("default")
  const [foldedIds, setFoldedIds] = useState<Set<string>>(() => new Set())
  const deferredQuery = useDeferredValue(query)
  const currentLeafRef = useRef<HTMLDivElement>(null)
  const locatedLeafId = useRef<string | null>(null)

  const rows = useMemo(
    () =>
      tree
        ? buildSessionTreeRows(tree, {
            filter,
            query: deferredQuery,
            foldedIds,
          })
        : [],
    [deferredQuery, filter, foldedIds, tree]
  )
  const selectedEntry = tree?.entries.find(
    (entry) => entry.id === selectedEntryId
  )
  const activeCount = tree ? sessionTreeActiveCount(tree) : 0
  const currentEntryId = tree ? sessionTreeCurrentEntryId(tree) : null

  useEffect(() => {
    if (!tree?.leafId || locatedLeafId.current === tree.leafId) return
    const leaf = currentLeafRef.current
    if (!leaf) return
    leaf.scrollIntoView({ block: "center" })
    locatedLeafId.current = tree.leafId
  }, [rows, tree?.leafId])

  function toggleFold(entryId: string) {
    setFoldedIds((current) => {
      const next = new Set(current)
      if (next.has(entryId)) next.delete(entryId)
      else next.add(entryId)
      return next
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="shrink-0 gap-1 border-b px-5 py-4 pr-14 text-left">
        <DialogTitle className="text-lg">Session tree</DialogTitle>
        <DialogDescription>
          {tree
            ? `${sessionTreeEntryCount(tree)} entries · 当前分支 ${activeCount}`
            : "正在读取真实的 JSONL 分支…"}
        </DialogDescription>
      </DialogHeader>

      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索消息或标签"
            aria-label="搜索 session tree"
            className="pl-8"
          />
        </div>
        <div
          className="grid grid-cols-4 rounded-lg bg-muted p-0.5"
          aria-label="Session tree 过滤器"
        >
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                filter === option.value &&
                  "bg-background text-foreground shadow-xs"
              )}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto bg-muted/15 px-3 py-2 sm:px-4"
        data-session-tree-scroll
      >
        {working && !tree ? (
          <div className="flex h-full min-h-56 items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" />
            读取 Session tree…
          </div>
        ) : null}

        {tree && rows.length ? (
          <div
            className="relative min-w-0"
            role="tree"
            aria-label="Session entries"
            style={{ height: rows.length * rowHeight }}
          >
            <svg
              className="pointer-events-none absolute top-0 left-0 w-full"
              height={rows.length * rowHeight}
              aria-hidden="true"
            >
              {rows.map((row, index) => {
                if (row.parentIndex === null) return null
                const parent = rows[row.parentIndex]
                if (!parent) return null
                const parentX = treeOrigin + parent.depth * depthStep
                const childX = treeOrigin + row.depth * depthStep
                const parentY = row.parentIndex * rowHeight + rowHeight / 2
                const childY = index * rowHeight + rowHeight / 2
                return (
                  <path
                    key={`${parent.entry.id}-${row.entry.id}`}
                    d={`M ${parentX} ${parentY} V ${childY} H ${childX}`}
                    fill="none"
                    strokeWidth="1.25"
                    className={cn(
                      "stroke-border",
                      parent.active && row.active && "stroke-foreground"
                    )}
                  />
                )
              })}
            </svg>

            {rows.map((row, index) => {
              const Icon = entryIcon(row.entry)
              const x = treeOrigin + row.depth * depthStep
              const selected = row.entry.id === selectedEntryId
              const branching = row.childCount > 1
              const labelBesideText =
                row.entry.label && row.entry.text
                  ? compactText(row.entry.label)
                  : null

              return (
                <div
                  key={row.entry.id}
                  ref={row.current ? currentLeafRef : undefined}
                  role="treeitem"
                  aria-level={row.depth + 1}
                  aria-selected={selected}
                  aria-current={row.current ? "true" : undefined}
                  aria-expanded={branching ? !row.folded : undefined}
                  className="absolute right-0 left-0"
                  style={{ top: index * rowHeight, height: rowHeight }}
                  data-entry-id={row.entry.id}
                  data-current={row.current || undefined}
                >
                  {branching ? (
                    <button
                      type="button"
                      className="absolute top-1/2 z-10 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border bg-background text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      style={{ left: x }}
                      onClick={() => toggleFold(row.entry.id)}
                      aria-label={row.folded ? "展开分支" : "折叠分支"}
                    >
                      {row.folded ? (
                        <PlusIcon className="size-2.5" />
                      ) : (
                        <MinusIcon className="size-2.5" />
                      )}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "absolute top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-border ring-1 ring-border",
                        row.active && "bg-foreground ring-foreground",
                        row.current && "size-2.5"
                      )}
                      style={{ left: x }}
                      aria-hidden="true"
                    />
                  )}

                  <button
                    type="button"
                    className={cn(
                      "absolute top-1 right-0 bottom-1 flex min-w-0 items-center gap-2 rounded-lg px-2.5 text-left transition-colors outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50",
                      row.active
                        ? "text-foreground"
                        : "text-muted-foreground/65",
                      selected &&
                        "bg-muted/80 text-foreground ring-1 ring-foreground/15"
                    )}
                    style={{ left: x + 12 }}
                    onClick={() => onSelectedEntryIdChange(row.entry.id)}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {labelBesideText ? (
                      <span className="shrink-0 rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium">
                        {labelBesideText}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {entryText(row.entry)}
                    </span>
                    {row.current ? (
                      <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                        当前
                      </span>
                    ) : null}
                    <time
                      className="shrink-0 text-[11px] text-muted-foreground tabular-nums"
                      dateTime={row.entry.timestamp}
                    >
                      {timeFormatter.format(new Date(row.entry.timestamp))}
                    </time>
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}

        {tree && !rows.length ? (
          <div className="flex h-full min-h-56 items-center justify-center text-center text-muted-foreground">
            没有符合当前条件的节点
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="shrink-0 border-t px-5 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex shrink-0 flex-col gap-3 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {selectedEntry ? (
              <>
                已选择 · {entryText(selectedEntry)} ·{" "}
                {timeFormatter.format(new Date(selectedEntry.timestamp))}
              </>
            ) : (
              "选择一个节点"
            )}
          </p>
          <label
            htmlFor="summarize-abandoned-branches"
            className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs"
          >
            <Switch
              id="summarize-abandoned-branches"
              size="sm"
              checked={summarize}
              onCheckedChange={onSummarizeChange}
            />
            总结放弃的分支
          </label>
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={working}>
            取消
          </Button>
          <Button
            onClick={onNavigate}
            disabled={
              working || !selectedEntryId || selectedEntryId === currentEntryId
            }
          >
            {working ? <LoaderCircleIcon className="animate-spin" /> : null}
            切换到此节点
          </Button>
        </div>
      </div>
    </div>
  )
}

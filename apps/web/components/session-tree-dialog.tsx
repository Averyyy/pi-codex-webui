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
import { FieldError } from "@workspace/ui/components/field"
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
import { useI18n } from "@/components/i18n-provider"
import type { Translator } from "@/lib/i18n"

const rowHeight = 46
const treeOrigin = 22
const depthStep = 26

const filters: SessionTreeFilter[] = ["default", "user", "labeled", "all"]

function filterLabel(t: Translator, filter: SessionTreeFilter) {
  const keys = {
    default: "session.tree.filter.default",
    user: "session.tree.filter.user",
    labeled: "session.tree.filter.labeled",
    all: "session.tree.filter.all",
  } as const
  return t(keys[filter])
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function entryText(entry: SessionTree["entries"][number], t: Translator) {
  if (entry.text) return compactText(entry.text)
  if (entry.label) return entry.label
  if (entry.role === "user") return t("session.tree.userMessage")
  if (entry.role === "assistant") return t("session.tree.assistantReply")
  if (entry.role === "toolResult") return t("session.tree.toolResult")
  if (entry.type === "compaction") return t("session.tree.compaction")
  if (entry.type === "branch_summary") return t("session.tree.branchSummary")
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
  const { locale, t } = useI18n()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<SessionTreeFilter>("default")
  const [foldedIds, setFoldedIds] = useState<Set<string>>(() => new Set())
  const deferredQuery = useDeferredValue(query)
  const currentLeafRef = useRef<HTMLDivElement>(null)
  const locatedLeafId = useRef<string | null>(null)
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale]
  )

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
        <DialogTitle className="text-lg">{t("session.tree.title")}</DialogTitle>
        <DialogDescription>
          {tree
            ? t(
                sessionTreeEntryCount(tree) === 1
                  ? "session.tree.summaryOne"
                  : "session.tree.summary",
                {
                  count: sessionTreeEntryCount(tree),
                  active: activeCount,
                }
              )
            : t("session.tree.loadingBranches")}
        </DialogDescription>
      </DialogHeader>

      <div className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            disabled={working}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("session.tree.searchPlaceholder")}
            aria-label={t("session.tree.searchAria")}
            className="pl-8"
          />
        </div>
        <div
          className="grid grid-cols-4 rounded-lg bg-muted p-0.5"
          role="group"
          aria-label={t("session.tree.filterAria")}
        >
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              disabled={working}
              aria-pressed={filter === option}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                filter === option && "bg-background text-foreground shadow-xs"
              )}
              onClick={() => setFilter(option)}
            >
              {filterLabel(t, option)}
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
            {t("session.tree.loading")}
          </div>
        ) : null}

        {tree && rows.length ? (
          <div
            className="relative min-w-0"
            role="list"
            aria-label={t("session.tree.entriesAria")}
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
                  role="listitem"
                  className="absolute right-0 left-0"
                  style={{ top: index * rowHeight, height: rowHeight }}
                  data-entry-id={row.entry.id}
                  data-current={row.current || undefined}
                >
                  {branching ? (
                    <button
                      type="button"
                      disabled={working}
                      className="absolute top-1/2 z-10 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border bg-background text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                      style={{ left: x }}
                      onClick={() => toggleFold(row.entry.id)}
                      aria-label={
                        row.folded
                          ? t("session.tree.expandBranch")
                          : t("session.tree.collapseBranch")
                      }
                      aria-expanded={!row.folded}
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
                    disabled={working}
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
                    aria-pressed={selected}
                    aria-current={row.current ? "true" : undefined}
                  >
                    <span className="sr-only">
                      {t("session.tree.depth", { count: row.depth + 1 })}
                    </span>
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {labelBesideText ? (
                      <span className="shrink-0 rounded bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-medium">
                        {labelBesideText}
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1 truncate">
                      {entryText(row.entry, t)}
                    </span>
                    {row.current ? (
                      <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                        {t("session.tree.current")}
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
            {t("session.tree.noMatches")}
          </div>
        ) : null}
      </div>

      {error ? (
        <FieldError className="shrink-0 border-t px-5 py-2">{error}</FieldError>
      ) : null}

      <div className="flex shrink-0 flex-col gap-3 border-t bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">
            {selectedEntry ? (
              <>
                {t("session.tree.selected", {
                  name: entryText(selectedEntry, t),
                  time: timeFormatter.format(new Date(selectedEntry.timestamp)),
                })}
              </>
            ) : (
              t("session.tree.selectNode")
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
              disabled={working}
              onCheckedChange={onSummarizeChange}
            />
            {t("session.tree.summarize")}
          </label>
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={working}>
            {t("session.tree.cancel")}
          </Button>
          <Button
            onClick={onNavigate}
            disabled={
              working || !selectedEntryId || selectedEntryId === currentEntryId
            }
          >
            {working ? <LoaderCircleIcon className="animate-spin" /> : null}
            {t("session.tree.navigate")}
          </Button>
        </div>
      </div>
    </div>
  )
}

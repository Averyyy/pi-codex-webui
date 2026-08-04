"use client"

import { useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useI18n } from "@/components/i18n-provider"
import {
  INITIAL_PROJECT_DIFF_LINES,
  nextProjectDiffLineLimit,
  parseProjectGitDiff,
  PROJECT_DIFF_LINE_INCREMENT,
  type ProjectGitDiffLine,
} from "@/lib/project-git-display"
import type { ProjectGitDiff } from "@/lib/project-git"

function lineMarker(kind: ProjectGitDiffLine["kind"]) {
  if (kind === "addition") return "+"
  if (kind === "deletion") return "-"
  if (kind === "context") return " "
  return null
}

function lineClassName(kind: ProjectGitDiffLine["kind"]) {
  if (kind === "addition") return "bg-emerald-500/10"
  if (kind === "deletion") return "bg-red-500/10"
  if (kind === "hunk") return "bg-blue-500/10 text-blue-700 dark:text-blue-300"
  if (kind === "meta") return "bg-muted/40 text-muted-foreground"
  return undefined
}

export function GitDiffSurface({ diff }: { diff: ProjectGitDiff }) {
  const { locale, t } = useI18n()
  const lines = useMemo(() => parseProjectGitDiff(diff.hunks), [diff.hunks])
  const [visibleLineCount, setVisibleLineCount] = useState(
    INITIAL_PROJECT_DIFF_LINES
  )
  const visibleLines = lines.slice(0, visibleLineCount)
  const remaining = lines.length - visibleLines.length
  const nextCount = Math.min(PROJECT_DIFF_LINE_INCREMENT, remaining)

  return (
    <div className="min-w-0 overflow-hidden border-b">
      <div className="overflow-x-auto">
        <table
          className="w-full table-fixed border-collapse font-mono text-xs leading-5"
          aria-label={t("project.review.diffAriaLabel", { path: diff.path })}
        >
          <colgroup>
            <col className="w-11" />
            <col className="w-11" />
            <col />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th scope="col">{t("project.review.oldLine")}</th>
              <th scope="col">{t("project.review.newLine")}</th>
              <th scope="col">{t("project.review.content")}</th>
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((line, index) => {
              if (line.kind === "meta" || line.kind === "hunk") {
                return (
                  <tr
                    key={`${line.kind}-${index}`}
                    className={lineClassName(line.kind)}
                  >
                    <td
                      colSpan={3}
                      className="border-y px-3 py-1 break-all whitespace-pre-wrap"
                    >
                      {line.content || "\u00a0"}
                    </td>
                  </tr>
                )
              }

              return (
                <tr
                  key={`${line.kind}-${index}`}
                  className={lineClassName(line.kind)}
                >
                  <td className="border-r px-2 text-right text-muted-foreground tabular-nums select-none">
                    {line.oldLine ?? ""}
                  </td>
                  <td className="border-r px-2 text-right text-muted-foreground tabular-nums select-none">
                    {line.newLine ?? ""}
                  </td>
                  <td className="min-w-0 px-2 align-top break-all whitespace-pre-wrap">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mr-2 select-none",
                        line.kind === "addition" &&
                          "text-emerald-700 dark:text-emerald-300",
                        line.kind === "deletion" &&
                          "text-red-700 dark:text-red-300"
                      )}
                    >
                      {lineMarker(line.kind)}
                    </span>
                    {line.content || "\u00a0"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {remaining > 0 ? (
        <div className="flex justify-center border-t p-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setVisibleLineCount((current) =>
                nextProjectDiffLineLimit(current, lines.length)
              )
            }
          >
            {t("project.review.showMore", {
              count: nextCount.toLocaleString(locale),
              remaining: remaining.toLocaleString(locale),
            })}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

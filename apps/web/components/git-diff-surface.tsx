"use client"

import { DiffModeEnum, DiffView } from "@git-diff-view/react"
import { useTheme } from "next-themes"

import type { ProjectGitDiff } from "@/lib/project-git"

export function GitDiffSurface({ diff }: { diff: ProjectGitDiff }) {
  const { resolvedTheme } = useTheme()
  return (
    <DiffView
      data={{
        oldFile: { fileName: diff.originalPath ?? diff.path },
        newFile: { fileName: diff.path },
        hunks: diff.hunks,
      }}
      diffViewMode={DiffModeEnum.Unified}
      diffViewTheme={resolvedTheme === "dark" ? "dark" : "light"}
      diffViewFontSize={12}
      diffViewHighlight
      diffViewWrap
    />
  )
}

"use client"

import { usePathname, useRouter } from "next/navigation"
import { ShieldCheckIcon, ShieldOffIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { ResourceCatalog } from "@workspace/runtime-protocol"

export interface ResourceProject {
  id: string
  name: string
  path: string
}

export function ResourceProjectControls({
  projects,
  projectId,
  catalog,
  mutationToken,
  working,
  onWorkingChange,
  onCatalogChange,
  onError,
}: {
  projects: ResourceProject[]
  projectId: string
  catalog: ResourceCatalog
  mutationToken: string
  working: boolean
  onWorkingChange: (working: boolean) => void
  onCatalogChange: (catalog: ResourceCatalog) => void
  onError: (error: string | null) => void
}) {
  const router = useRouter()
  const pathname = usePathname()

  async function setTrust(trusted: boolean) {
    onWorkingChange(true)
    onError(null)
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/trust`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify({ trusted }),
      })
      const result = (await response.json()) as ResourceCatalog & {
        error?: string
      }
      if (!response.ok) throw new Error(result.error ?? "更新项目信任失败。")
      onCatalogChange(result)
      router.refresh()
    } catch (failure) {
      onError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      onWorkingChange(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>资源上下文</CardTitle>
        <CardDescription>
          Global 设置由 Pi agent 目录管理；Project 设置写入选中项目的
          .pi/settings.json。
        </CardDescription>
        <CardAction>
          <Badge variant={catalog.projectTrusted ? "secondary" : "destructive"}>
            {catalog.projectTrusted ? "已信任" : "未信任"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <span className="text-sm font-medium">当前项目</span>
          <Select
            value={projectId}
            onValueChange={(value) =>
              router.push(`${pathname}?projectId=${encodeURIComponent(value)}`)
            }
          >
            <SelectTrigger className="w-full" aria-label="当前项目">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name} · {project.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {catalog.trustRequired ? (
          <Button
            type="button"
            variant={catalog.projectTrusted ? "outline" : "default"}
            disabled={working}
            onClick={() => void setTrust(!catalog.projectTrusted)}
          >
            {catalog.projectTrusted ? <ShieldOffIcon /> : <ShieldCheckIcon />}
            {catalog.projectTrusted ? "撤销信任" : "信任项目"}
          </Button>
        ) : (
          <span className="pb-2 text-xs text-muted-foreground">
            项目没有需要信任的本地资源
          </span>
        )}
      </CardContent>
      {catalog.trustRequired && !catalog.projectTrusted ? (
        <div className="border-t bg-destructive/5 px-4 py-3 text-sm text-destructive">
          项目未受信任；Pi 不会加载项目 settings、packages、skills 或
          extensions。
        </div>
      ) : null}
    </Card>
  )
}

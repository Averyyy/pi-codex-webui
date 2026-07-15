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

import { useI18n } from "@/components/i18n-provider"

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
  const { t } = useI18n()

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
      if (!response.ok) {
        throw new Error(result.error ?? t("settings.common.saveFailed"))
      }
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
        <CardTitle>{t("settings.resources.context")}</CardTitle>
        <CardDescription>
          {t("settings.resources.contextDescription")}
        </CardDescription>
        <CardAction>
          <Badge variant={catalog.projectTrusted ? "secondary" : "destructive"}>
            {catalog.projectTrusted
              ? t("settings.resources.trusted")
              : t("settings.resources.untrusted")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <span className="text-sm font-medium">
            {t("settings.resources.currentProject")}
          </span>
          <Select
            value={projectId}
            onValueChange={(value) =>
              router.push(`${pathname}?projectId=${encodeURIComponent(value)}`)
            }
          >
            <SelectTrigger
              className="w-full"
              aria-label={t("settings.resources.currentProject")}
            >
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
            {catalog.projectTrusted
              ? t("settings.resources.revokeTrust")
              : t("settings.resources.trustProject")}
          </Button>
        ) : (
          <span className="pb-2 text-xs text-muted-foreground">
            {t("settings.resources.noLocalResources")}
          </span>
        )}
      </CardContent>
      {catalog.trustRequired && !catalog.projectTrusted ? (
        <div className="border-t bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("settings.resources.projectUntrusted")}
        </div>
      ) : null}
    </Card>
  )
}

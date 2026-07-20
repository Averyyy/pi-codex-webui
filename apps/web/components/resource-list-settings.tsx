"use client"

import { useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Switch } from "@workspace/ui/components/switch"
import type { ResourceCatalog, ResourceView } from "@workspace/runtime-protocol"

import {
  ResourceProjectControls,
  type ResourceProject,
} from "@/components/resource-project-controls"
import { useI18n } from "@/components/i18n-provider"
import { useResourceCatalog } from "@/lib/use-resource-catalog"

export function ResourceListSettings({
  kind,
  projects,
  projectId,
  sessionIds,
  initialCatalog,
  mutationToken,
}: {
  kind: "extension" | "skill"
  projects: ResourceProject[]
  projectId: string
  sessionIds: string[]
  initialCatalog: ResourceCatalog
  mutationToken: string
}) {
  const { t } = useI18n()
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [trustWorking, setTrustWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useResourceCatalog(
    projectId,
    sessionIds,
    initialCatalog,
    setError
  )
  const resources = catalog.resources.filter(
    (resource) => resource.type === kind
  )
  const busy = workingId !== null || trustWorking

  async function toggle(resource: ResourceView, enabled: boolean) {
    setWorkingId(resource.id)
    setError(null)
    try {
      const response = await fetch(`/api/v1/${kind}s/${resource.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify({
          projectId,
          writeScope: resource.scope,
          enabled,
        }),
      })
      const result = (await response.json()) as ResourceCatalog & {
        error?: string
      }
      if (!response.ok)
        throw new Error(result.error ?? t("settings.common.saveFailed"))
      setCatalog(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="grid gap-6">
      <ResourceProjectControls
        projects={projects}
        projectId={projectId}
        catalog={catalog}
        mutationToken={mutationToken}
        working={busy}
        onWorkingChange={setTrustWorking}
        onCatalogChange={setCatalog}
        onError={setError}
      />
      {(["global", "project"] as const).map((scope) => {
        const scoped = resources.filter((resource) => resource.scope === scope)
        return (
          <section key={scope} className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {scope === "global"
                  ? t("settings.resources.global")
                  : t("settings.resources.project")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("settings.resources.count", { count: scoped.length })}
              </span>
            </div>
            {scoped.length ? (
              scoped.map((resource) => (
                <Card key={resource.id} size="sm">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {resource.name}
                      {resource.inherited ? (
                        <Badge variant="outline">
                          {t("settings.resources.inherited")}
                        </Badge>
                      ) : null}
                      {resource.overridden ? (
                        <Badge variant="secondary">
                          {t("settings.resources.override")}
                        </Badge>
                      ) : null}
                      {resource.reloadRequired ? (
                        <Badge variant="outline">
                          {t("settings.resources.reload")}
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription className="break-all">
                      {resource.packageSource ?? resource.sourcePath}
                    </CardDescription>
                    <CardAction>
                      <Switch
                        aria-label={`${resource.name} ${t("settings.resources.enabled")}`}
                        checked={resource.enabled}
                        disabled={
                          busy ||
                          (scope === "project" && !catalog.projectTrusted)
                        }
                        onCheckedChange={(enabled) =>
                          void toggle(resource, enabled)
                        }
                      />
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{resource.source}</span>
                    <span>·</span>
                    <span className="break-all">{resource.sourcePath}</span>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                {t("settings.resources.empty", {
                  kind: kind === "skill" ? "skill" : "extension",
                })}
              </p>
            )}
          </section>
        )
      })}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import {
  resourceCatalogSchema,
  type ResourceCatalog,
  type ResourceView,
} from "@workspace/runtime-protocol"

import {
  ResourceProjectControls,
  type ResourceProject,
} from "@/components/resource-project-controls"
import { useI18n } from "@/components/i18n-provider"
import { validatedResponseJson } from "@/lib/api-response"
import { useResourceCatalog } from "@/lib/use-resource-catalog"

function resourceDisplayName(resource: ResourceView) {
  return resource.type === "extension" && resource.packageSource
    ? resource.packageSource
    : resource.name
}

function resourceDescription(resource: ResourceView) {
  return resource.type === "extension" && resource.packageSource
    ? resource.name
    : (resource.packageSource ?? resource.sourcePath)
}

function matchesQuery(resource: ResourceView, query: string) {
  return [
    resource.name,
    resource.packageSource,
    resource.sourcePath,
    resource.source,
  ].some((value) => value?.toLocaleLowerCase().includes(query))
}

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
  const [query, setQuery] = useState("")
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [trustWorking, setTrustWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workingRef = useRef(false)
  const errorRef = useRef<HTMLParagraphElement | null>(null)
  const focusErrorRef = useRef(false)
  const [catalog, setCatalog] = useResourceCatalog(
    projectId,
    sessionIds,
    initialCatalog,
    setError,
    t("settings.resources.readFailed")
  )
  const resources = catalog.resources.filter(
    (resource) => resource.type === kind
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleResources = normalizedQuery
    ? resources.filter((resource) => matchesQuery(resource, normalizedQuery))
    : resources
  const busy = workingId !== null || trustWorking
  const kindLabel =
    kind === "skill"
      ? t("settings.resources.kind.skills")
      : t("settings.resources.kind.extensions")

  useEffect(() => {
    if (!error || busy || !focusErrorRef.current) return
    focusErrorRef.current = false
    const frame = requestAnimationFrame(() => errorRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [busy, error])

  function reportMutationError(failure: unknown) {
    focusErrorRef.current = true
    setError(failure instanceof Error ? failure.message : String(failure))
  }

  function handleProjectError(message: string | null) {
    if (message) focusErrorRef.current = true
    setError(message)
  }

  async function toggle(resource: ResourceView, enabled: boolean) {
    if (workingRef.current) return
    workingRef.current = true
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
      const result = await validatedResponseJson(
        response,
        (value) => resourceCatalogSchema.parse(value),
        t("settings.common.saveFailed")
      )
      setCatalog(result)
    } catch (failure) {
      reportMutationError(failure)
    } finally {
      workingRef.current = false
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
        onError={handleProjectError}
      />
      <div className="grid gap-1.5">
        <Input
          type="search"
          value={query}
          autoComplete="off"
          aria-label={t("settings.resources.searchLabel", {
            kind: kindLabel,
          })}
          placeholder={t("settings.resources.searchPlaceholder", {
            kind: kindLabel,
          })}
          onChange={(event) => {
            setQuery(event.target.value)
            setError(null)
          }}
        />
        {normalizedQuery ? (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {t("settings.resources.filteredSummary", {
              visible: visibleResources.length,
              total: resources.length,
            })}
          </p>
        ) : null}
      </div>
      {(["global", "project"] as const).map((scope) => {
        const allScoped = resources.filter(
          (resource) => resource.scope === scope
        )
        const scoped = visibleResources.filter(
          (resource) => resource.scope === scope
        )
        const scopeLabel =
          scope === "global"
            ? t("settings.resources.global")
            : t("settings.resources.project")
        return (
          <section key={scope} className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">{scopeLabel}</h2>
              <span className="text-xs text-muted-foreground">
                {t(
                  allScoped.length === 1
                    ? "settings.resources.countOne"
                    : "settings.resources.countMany",
                  { count: allScoped.length }
                )}
              </span>
            </div>
            {scoped.length ? (
              scoped.map((resource) => (
                <Card key={resource.id} size="sm">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {resourceDisplayName(resource)}
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
                      {resource.missing ? (
                        <Badge variant="destructive">
                          {t("settings.resources.missing")}
                        </Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription className="break-all">
                      {resourceDescription(resource)}
                    </CardDescription>
                    <CardAction>
                      <Switch
                        aria-label={t("settings.resources.toggleEnabled", {
                          scope: scopeLabel,
                          name: resourceDisplayName(resource),
                        })}
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
                    <span>
                      {resource.source === "package"
                        ? t("settings.resources.source.package")
                        : resource.source === "directory"
                          ? t("settings.resources.source.directory")
                          : t("settings.resources.source.explicitPath")}
                    </span>
                    <span>·</span>
                    <span className="break-all">{resource.sourcePath}</span>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                {allScoped.length
                  ? t("settings.resources.noMatches")
                  : t("settings.resources.empty", {
                      kind: kindLabel,
                    })}
              </p>
            )}
          </section>
        )
      })}
      {error ? (
        <p
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="text-sm text-destructive outline-none"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

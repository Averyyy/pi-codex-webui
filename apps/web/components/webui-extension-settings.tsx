"use client"

import { usePathname, useRouter } from "next/navigation"
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"

import type { ResourceProject } from "@/components/resource-project-controls"
import type {
  WebUiExtensionCatalogView,
  WebUiExtensionGroupView,
} from "@/lib/webui-extensions/types"
import { useI18n } from "@/components/i18n-provider"
import { responseJson } from "@/lib/api-response"
import type { Translator } from "@/lib/i18n"
import { newestSettingsRevision } from "@/lib/settings-revision"

const STATUS_LABEL_KEYS = {
  tested: "settings.webui.status.tested",
  "compatible-by-probe": "settings.webui.status.compatibleByProbe",
  unknown: "settings.webui.status.unknown",
  incompatible: "settings.webui.status.incompatible",
  disabled: "settings.webui.status.disabled",
  conflict: "settings.webui.status.conflict",
  tui: "settings.webui.status.tui",
  error: "settings.webui.status.error",
} as const

function sourceLabel(
  source: WebUiExtensionGroupView["candidates"][number]["source"],
  t: Translator
) {
  if (source === "builtin") return t("settings.webui.source.builtin")
  if (source === "project") return t("settings.webui.source.project")
  if (source === "development") return t("settings.webui.source.development")
  return t("settings.webui.source.external")
}

export function WebUiExtensionSettings({
  projects,
  projectId,
  sessionIds,
  initialCatalog,
  mutationToken,
}: {
  projects: ResourceProject[]
  projectId: string | null
  sessionIds: string[]
  initialCatalog: WebUiExtensionCatalogView
  mutationToken: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [catalog, setCatalog] = useState(initialCatalog)
  const [query, setQuery] = useState("")
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const catalogUpdateSequence = useRef(0)
  const sessionKey = sessionIds.join("\0")
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleGroups = normalizedQuery
    ? catalog.groups.filter((group) =>
        [
          group.id,
          group.name,
          ...group.candidates.flatMap((candidate) => [
            candidate.packageName,
            candidate.target.packageName,
            candidate.target.extensionPath,
          ]),
        ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
      )
    : catalog.groups

  useEffect(() => {
    if (!sessionKey) return
    let active = true
    const search = new URLSearchParams()
    for (const sessionId of sessionKey.split("\0")) {
      search.append("sessionId", sessionId)
    }
    const events = new EventSource(`/api/v1/events?${search}`)
    const refresh = async () => {
      const sequence = ++catalogUpdateSequence.current
      try {
        const query = projectId
          ? `?projectId=${encodeURIComponent(projectId)}`
          : ""
        const response = await fetch(`/api/v1/webui-extensions${query}`)
        const next = await responseJson<WebUiExtensionCatalogView>(
          response,
          t("settings.webui.readFailed")
        )
        if (!active || sequence !== catalogUpdateSequence.current) return
        setCatalog((current) => newestSettingsRevision(current, next))
        setError(null)
      } catch (failure) {
        if (!active || sequence !== catalogUpdateSequence.current) return
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    }
    const handle = () => void refresh()
    events.addEventListener("runtime.ready", handle)
    events.addEventListener("runtime.stopped", handle)
    events.addEventListener("runtime.crashed", handle)
    events.addEventListener("resync.required", handle)
    return () => {
      active = false
      catalogUpdateSequence.current += 1
      events.close()
    }
  }, [projectId, sessionKey, t])

  function acceptCatalog(next: WebUiExtensionCatalogView) {
    catalogUpdateSequence.current += 1
    setCatalog((current) => newestSettingsRevision(current, next))
  }

  async function update(
    group: WebUiExtensionGroupView,
    patch: Partial<WebUiExtensionGroupView["preference"]>
  ) {
    setWorkingId(group.id)
    setError(null)
    try {
      const response = await fetch(`/api/v1/webui-extensions/${group.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"revision-${catalog.revision}"`,
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify({
          projectId: projectId ?? undefined,
          ...group.preference,
          ...patch,
        }),
      })
      const result = await responseJson<WebUiExtensionCatalogView>(
        response,
        t("settings.webui.updateFailed")
      )
      acceptCatalog(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      router.refresh()
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {projects.length > 0 && projectId ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.webui.context")}</CardTitle>
            <CardDescription>
              {t("settings.webui.contextDescription")}
            </CardDescription>
            <CardAction>
              <Badge variant={catalog.projectTrusted ? "secondary" : "outline"}>
                {catalog.projectTrusted
                  ? t("settings.webui.projectTrusted")
                  : t("settings.webui.globalOnly")}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldTitle>{t("settings.webui.currentProject")}</FieldTitle>
                <Select
                  value={projectId}
                  disabled={workingId !== null}
                  onValueChange={(value) =>
                    router.push(
                      `${pathname}?projectId=${encodeURIComponent(value)}`
                    )
                  }
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t("settings.webui.currentProject")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name} · {project.path}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-1.5">
        <Input
          type="search"
          value={query}
          autoComplete="off"
          aria-label={t("settings.resources.searchLabel", {
            kind: "Adapter",
          })}
          placeholder={t("settings.resources.searchPlaceholder", {
            kind: "Adapter",
          })}
          onChange={(event) => setQuery(event.target.value)}
        />
        {normalizedQuery ? (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {t("settings.resources.filteredSummary", {
              visible: visibleGroups.length,
              total: catalog.groups.length,
            })}
          </p>
        ) : null}
      </div>

      {visibleGroups.map((group) => {
        const status = catalog.statuses.find(
          (entry) => entry.extensionId === group.id
        )
        const disabled = workingId !== null
        return (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {group.name}
                <Badge variant="outline">
                  {status
                    ? t(STATUS_LABEL_KEYS[status.state])
                    : t("settings.webui.notProbed")}
                </Badge>
              </CardTitle>
              <CardDescription>
                {status?.reason ?? t("settings.webui.statusFallback")}
              </CardDescription>
              <CardAction>
                <Switch
                  checked={group.preference.enabled}
                  disabled={disabled}
                  aria-label={t("settings.webui.enabled", { name: group.name })}
                  onCheckedChange={(enabled) => void update(group, { enabled })}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>
                      {t("settings.webui.nativeRendering")}
                    </FieldTitle>
                    <FieldDescription>
                      {t("settings.webui.nativeDescription")}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    checked={group.preference.rendering === "native"}
                    disabled={disabled || !group.preference.enabled}
                    aria-label={`${group.name} ${t("settings.webui.nativeRendering")}`}
                    onCheckedChange={(native) =>
                      void update(group, {
                        rendering: native ? "native" : "tui",
                      })
                    }
                  />
                </Field>

                {group.candidates.length > 1 ? (
                  <Field>
                    <FieldTitle>{t("settings.webui.conflict")}</FieldTitle>
                    <FieldDescription>
                      {t("settings.webui.conflictDescription")}
                    </FieldDescription>
                    <Select
                      value={group.preference.selectedAdapter ?? "automatic"}
                      disabled={disabled || !group.preference.enabled}
                      onValueChange={(value) =>
                        void update(group, {
                          selectedAdapter: value === "automatic" ? null : value,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={t("settings.webui.adapterSelection")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="automatic">
                            {t("settings.webui.automatic")}
                          </SelectItem>
                          {group.candidates.map((candidate) => (
                            <SelectItem
                              key={candidate.key}
                              value={candidate.key}
                            >
                              {sourceLabel(candidate.source, t)} ·{" "}
                              {candidate.packageName} {candidate.packageVersion}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}

                <Field>
                  <FieldTitle>{t("settings.webui.available")}</FieldTitle>
                  <div className="grid gap-3">
                    {group.candidates.map((candidate) => {
                      const active = status?.adapterKey === candidate.key
                      return (
                        <div
                          key={candidate.key}
                          className="grid gap-2 rounded-lg border p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <span>{candidate.packageName}</span>
                            <Badge variant="outline">
                              {sourceLabel(candidate.source, t)}
                            </Badge>
                            {active ? (
                              <Badge variant="secondary">
                                {group.preference.selectedAdapter
                                  ? t("settings.webui.userSelected")
                                  : t("settings.webui.active")}
                              </Badge>
                            ) : null}
                          </div>
                          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-muted-foreground [&_dd]:min-w-0 [&_dd]:break-words">
                            <dt>{t("settings.webui.adapter")}</dt>
                            <dd>{candidate.packageVersion}</dd>
                            <dt>{t("settings.webui.target")}</dt>
                            <dd>
                              {candidate.target.packageName ??
                                candidate.target.extensionPath}
                              {active && status?.targetPackageVersion
                                ? ` ${status.targetPackageVersion}`
                                : ""}
                            </dd>
                            <dt>{t("settings.webui.supported")}</dt>
                            <dd>
                              {candidate.target.version ??
                                t("settings.webui.capabilityProbe")}
                            </dd>
                            <dt>{t("settings.webui.tested")}</dt>
                            <dd>
                              {candidate.target.testedVersions?.join(", ") ??
                                t("settings.webui.noPinnedVersions")}
                            </dd>
                            <dt>{t("settings.webui.probe")}</dt>
                            <dd>
                              {active && status?.probePassed
                                ? t("settings.webui.probePassed")
                                : t("settings.webui.probeNotPassed")}
                            </dd>
                          </dl>
                        </div>
                      )
                    })}
                    <FieldDescription>
                      {t("settings.webui.fallback")}
                    </FieldDescription>
                  </div>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        )
      })}

      {!catalog.groups.length ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.webui.noAdapters")}</CardTitle>
            <CardDescription>
              {t("settings.webui.noAdaptersDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {catalog.groups.length && !visibleGroups.length ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {t("settings.resources.noMatches")}
        </p>
      ) : null}

      {catalog.diagnostics.map((diagnostic) => (
        <p
          key={`${diagnostic.path}:${diagnostic.message}`}
          role="alert"
          className="text-sm text-destructive"
        >
          {diagnostic.path}: {diagnostic.message}
        </p>
      ))}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

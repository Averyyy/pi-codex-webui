"use client"

import { usePathname, useRouter } from "next/navigation"
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
} from "@workspace/ui/components/field"
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

const STATUS_LABELS = {
  tested: "Tested",
  "compatible-by-probe": "Compatible by probe",
  unknown: "Unknown",
  incompatible: "Incompatible",
  disabled: "Disabled",
  conflict: "Conflict",
  tui: "Prefer TUI",
  error: "Error",
} as const

function sourceLabel(
  source: WebUiExtensionGroupView["candidates"][number]["source"]
) {
  if (source === "builtin") return "Built-in"
  if (source === "project") return "Project"
  if (source === "development") return "Development"
  return "External"
}

export function WebUiExtensionSettings({
  projects,
  projectId,
  initialCatalog,
  mutationToken,
}: {
  projects: ResourceProject[]
  projectId: string | null
  initialCatalog: WebUiExtensionCatalogView
  mutationToken: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [catalog, setCatalog] = useState(initialCatalog)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      const result = (await response.json()) as WebUiExtensionCatalogView & {
        error?: string
      }
      if (!response.ok) {
        throw new Error(result.error ?? "WebUI extension update failed.")
      }
      setCatalog(result)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
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

      {catalog.groups.map((group) => {
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
                  {status ? STATUS_LABELS[status.state] : "Not probed"}
                </Badge>
              </CardTitle>
              <CardDescription>
                {status?.reason ?? "Pi TUI remains available as fallback."}
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
                              {sourceLabel(candidate.source)} ·{" "}
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
                              {sourceLabel(candidate.source)}
                            </Badge>
                            {active ? (
                              <Badge variant="secondary">
                                {group.preference.selectedAdapter
                                  ? t("settings.webui.userSelected")
                                  : t("settings.webui.active")}
                              </Badge>
                            ) : null}
                          </div>
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
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
                              {candidate.target.version ?? "Capability probe"}
                            </dd>
                            <dt>{t("settings.webui.tested")}</dt>
                            <dd>
                              {candidate.target.testedVersions?.join(", ") ??
                                "No pinned versions"}
                            </dd>
                            <dt>{t("settings.webui.probe")}</dt>
                            <dd>
                              {active && status?.probePassed
                                ? "Passed"
                                : "Not passed in this session"}
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

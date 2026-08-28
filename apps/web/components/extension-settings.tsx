"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  LoaderCircleIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"

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
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  resourceCatalogSchema,
  type ResourceCatalog,
  type ResourceView,
} from "@workspace/runtime-protocol"

import {
  ResourceProjectControls,
  type ResourceProject,
} from "@/components/resource-project-controls"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useI18n } from "@/components/i18n-provider"
import { ResourceListContent } from "@/components/resource-list-settings"
import { validatedResponseJson } from "@/lib/api-response"
import { useResourceCatalog } from "@/lib/use-resource-catalog"

export function ExtensionSettings({
  projects,
  projectId,
  sessionIds,
  initialCatalog,
  mutationToken,
}: {
  projects: ResourceProject[]
  projectId: string
  sessionIds: string[]
  initialCatalog: ResourceCatalog
  mutationToken: string
}) {
  const { t } = useI18n()
  const [source, setSource] = useState("")
  const [scope, setScope] = useState<"global" | "project">("global")
  const [query, setQuery] = useState("")
  const [working, setWorking] = useState<string | null>(null)
  const [extensionWorkingId, setExtensionWorkingId] = useState<string | null>(
    null
  )
  const [pendingRemove, setPendingRemove] = useState<
    ResourceCatalog["packages"][number] | null
  >(null)
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
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visiblePackages = normalizedQuery
    ? catalog.packages.filter((pkg) =>
        [pkg.source, pkg.installedPath, pkg.scope].some((value) =>
          value?.toLocaleLowerCase().includes(normalizedQuery)
        )
      )
    : catalog.packages
  const busy = working !== null || extensionWorkingId !== null || trustWorking

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

  async function readCatalog(response: Response) {
    const result = await validatedResponseJson(
      response,
      (value) => resourceCatalogSchema.parse(value),
      t("settings.common.saveFailed")
    )
    setCatalog(result)
  }

  async function install(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const packageSource = source.trim()
    if (!packageSource || workingRef.current) return
    workingRef.current = true
    setWorking("install")
    setError(null)
    try {
      await readCatalog(
        await fetch("/api/v1/packages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({ projectId, source: packageSource, scope }),
        })
      )
      setSource("")
    } catch (failure) {
      reportMutationError(failure)
    } finally {
      workingRef.current = false
      setWorking(null)
    }
  }

  async function mutate(packageId: string, operation: "remove" | "update") {
    if (workingRef.current) return
    workingRef.current = true
    setWorking(`${operation}:${packageId}`)
    setError(null)
    try {
      await readCatalog(
        await fetch(
          operation === "remove"
            ? `/api/v1/packages/${packageId}?projectId=${encodeURIComponent(projectId)}`
            : `/api/v1/packages/${packageId}/update`,
          {
            method: operation === "remove" ? "DELETE" : "POST",
            headers: {
              ...(operation === "update"
                ? { "Content-Type": "application/json" }
                : {}),
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
            body:
              operation === "update"
                ? JSON.stringify({ projectId })
                : undefined,
          }
        )
      )
    } catch (failure) {
      reportMutationError(failure)
    } finally {
      workingRef.current = false
      setWorking(null)
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    const packageId = pendingRemove.id
    setPendingRemove(null)
    await mutate(packageId, "remove")
  }

  async function toggleExtension(resource: ResourceView, enabled: boolean) {
    if (workingRef.current) return
    workingRef.current = true
    setExtensionWorkingId(resource.id)
    setError(null)
    try {
      await readCatalog(
        await fetch(`/api/v1/extensions/${resource.id}`, {
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
      )
    } catch (failure) {
      reportMutationError(failure)
    } finally {
      workingRef.current = false
      setExtensionWorkingId(null)
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
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.packages.installTitle")}</CardTitle>
          <CardDescription>
            {t("settings.packages.installDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
            onSubmit={install}
          >
            <Input
              value={source}
              disabled={busy}
              onChange={(event) => {
                setSource(event.target.value)
                setError(null)
              }}
              placeholder={t("settings.packages.sourcePlaceholder")}
              aria-label={t("settings.packages.source")}
            />
            <Select
              value={scope}
              disabled={busy}
              onValueChange={(value) => setScope(value as "global" | "project")}
            >
              <SelectTrigger aria-label={t("settings.packages.scope")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  {t("settings.packages.global")}
                </SelectItem>
                <SelectItem value="project">
                  {t("settings.packages.currentProject")}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              disabled={
                busy ||
                !source.trim() ||
                (scope === "project" && !catalog.projectTrusted)
              }
            >
              {working === "install" ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <PackagePlusIcon />
              )}
              {t("settings.packages.install")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <section className="grid gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {t("settings.packages.configured")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t(
              catalog.packages.length === 1
                ? "settings.packages.itemCountOne"
                : "settings.packages.itemCountMany",
              { count: catalog.packages.length }
            )}
          </span>
        </div>
        <div className="grid gap-1.5">
          <Input
            type="search"
            value={query}
            autoComplete="off"
            aria-label={t("settings.resources.searchLabel", {
              kind: t("settings.packages.kind"),
            })}
            placeholder={t("settings.resources.searchPlaceholder", {
              kind: t("settings.packages.kind"),
            })}
            onChange={(event) => {
              setQuery(event.target.value)
              setError(null)
            }}
          />
          {normalizedQuery ? (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {t("settings.resources.filteredSummary", {
                visible: visiblePackages.length,
                total: catalog.packages.length,
              })}
            </p>
          ) : null}
        </div>
        {visiblePackages.length ? (
          visiblePackages.map((pkg) => (
            <Card key={pkg.id} size="sm">
              <CardHeader>
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 break-all">
                  {pkg.source}
                  <Badge variant="outline">
                    {pkg.scope === "global"
                      ? t("settings.resources.global")
                      : t("settings.resources.project")}
                  </Badge>
                  {pkg.missing ? (
                    <Badge variant="destructive">
                      {t("settings.packages.missing")}
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription className="break-all">
                  {pkg.installedPath ?? t("settings.packages.missingPath")}
                </CardDescription>
                <CardAction className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("settings.packages.update", {
                      source: pkg.source,
                    })}
                    disabled={busy}
                    onClick={() => void mutate(pkg.id, "update")}
                  >
                    {working === `update:${pkg.id}` ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <RefreshCwIcon />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("settings.packages.remove", {
                      source: pkg.source,
                    })}
                    disabled={busy}
                    onClick={() => setPendingRemove(pkg)}
                  >
                    {working === `remove:${pkg.id}` ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <Trash2Icon />
                    )}
                  </Button>
                </CardAction>
              </CardHeader>
              {pkg.filtered ? (
                <CardContent className="text-xs text-muted-foreground">
                  {t("settings.packages.filtered")}
                </CardContent>
              ) : null}
            </Card>
          ))
        ) : catalog.packages.length ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            {t("settings.resources.noMatches")}
          </p>
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            {t("settings.packages.empty")}
          </p>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">
          {t("settings.extensions.enabled")}
        </h2>
        <ResourceListContent
          kind="extension"
          catalog={catalog}
          busy={busy}
          onToggle={(resource, enabled) =>
            void toggleExtension(resource, enabled)
          }
          onQueryChange={() => setError(null)}
        />
      </section>
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
      {pendingRemove ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingRemove(null)
          }}
          title={t("settings.packages.confirmRemoveTitle")}
          description={t("settings.packages.confirmRemoveDescription", {
            source: pendingRemove.source,
          })}
          cancelLabel={t("settings.packages.cancel")}
          confirmLabel={t("settings.packages.confirmRemove")}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </div>
  )
}

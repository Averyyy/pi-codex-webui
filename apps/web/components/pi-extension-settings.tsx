"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  LoaderCircleIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  CheckCircle2Icon,
  AlertCircleIcon,
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

import type { ResourceProject } from "@/components/resource-project-controls"
import { ResourceProjectControls } from "@/components/resource-project-controls"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useI18n } from "@/components/i18n-provider"
import { validatedResponseJson } from "@/lib/api-response"
import { useResourceCatalog } from "@/lib/use-resource-catalog"

// Pi extension types
interface PiExtension {
  id: string
  name: string
  version: string
  description: string
  scope: "global" | "project"
  installed: boolean
  updateAvailable: boolean
  status: "active" | "inactive" | "error"
}

interface PiExtensionCatalog {
  extensions: PiExtension[]
  revision: number
  projectTrusted: boolean
}

// Mock catalog for demonstration - in production this would come from the API
const mockCatalog: PiExtensionCatalog = {
  extensions: [
    {
      id: "subagent",
      name: "@tintinweb/pi-subagents",
      version: "0.80.6",
      description: "多智能体协作扩展，支持并行任务执行",
      scope: "global",
      installed: true,
      updateAvailable: false,
      status: "active",
    },
    {
      id: "coding-agent",
      name: "@earendil-works/pi-coding-agent",
      version: "0.80.6",
      description: "代码生成和重构智能体",
      scope: "global",
      installed: true,
      updateAvailable: false,
      status: "active",
    },
    {
      id: "pi-ai",
      name: "@earendil-works/pi-ai",
      version: "0.80.6",
      description: "Pi AI 核心扩展",
      scope: "global",
      installed: true,
      updateAvailable: false,
      status: "active",
    },
  ],
  revision: 1,
  projectTrusted: true,
}

export function PiExtensionSettings({
  projects,
  projectId,
  sessionIds,
  initialCatalog,
  mutationToken,
}: {
  projects: ResourceProject[]
  projectId: string
  sessionIds: string[]
  initialCatalog: any // Replace with actual catalog type
  mutationToken: string
}) {
  const { t } = useI18n()
  const [catalog, setCatalog] = useState<PiExtensionCatalog>(mockCatalog)
  const [source, setSource] = useState("")
  const [scope, setScope] = useState<"global" | "project">("global")
  const [query, setQuery] = useState("")
  const [working, setWorking] = useState<string | null>(null)
  const [pendingRemove, setPendingRemove] = useState<PiExtension | null>(null)
  const [trustWorking, setTrustWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const workingRef = useRef(false)
  const errorRef = useRef<HTMLParagraphElement | null>(null)
  const focusErrorRef = useRef(false)

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleExtensions = normalizedQuery
    ? catalog.extensions.filter((ext) =>
        [ext.name, ext.description, ext.scope].some((value) =>
          value?.toLocaleLowerCase().includes(normalizedQuery)
        )
      )
    : catalog.extensions

  const busy = working !== null || trustWorking

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

  async function install(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const extensionSource = source.trim()
    if (!extensionSource || workingRef.current) return
    workingRef.current = true
    setWorking("install")
    setError(null)
    try {
      // TODO: Implement actual API call
      // await fetch("/api/v1/pi-extensions", { ... })
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setSource("")
      setError(null)
    } catch (failure) {
      reportMutationError(failure)
    } finally {
      workingRef.current = false
      setWorking(null)
    }
  }

  async function mutate(extensionId: string, operation: "remove" | "update") {
    if (workingRef.current) return
    workingRef.current = true
    setWorking(`${operation}:${extensionId}`)
    setError(null)
    try {
      // TODO: Implement actual API call
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setError(null)
    } catch (failure) {
      reportMutationError(failure)
    } finally {
      workingRef.current = false
      setWorking(null)
    }
  }

  async function confirmRemove() {
    if (!pendingRemove) return
    const extensionId = pendingRemove.id
    setPendingRemove(null)
    await mutate(extensionId, "remove")
  }

  function getStatusIcon(status: PiExtension["status"]) {
    switch (status) {
      case "active":
        return <CheckCircle2Icon className="h-4 w-4 text-green-600" />
      case "error":
        return <AlertCircleIcon className="h-4 w-4 text-destructive" />
      default:
        return null
    }
  }

  return (
    <div className="grid gap-6">
      <ResourceProjectControls
        projects={projects}
        projectId={projectId}
        catalog={initialCatalog}
        mutationToken={mutationToken}
        working={busy}
        onWorkingChange={setTrustWorking}
        onCatalogChange={() => {}}
        onError={handleProjectError}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.piExtensions.installTitle")}</CardTitle>
          <CardDescription>
            {t("settings.piExtensions.installDescription")}
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
              placeholder={t("settings.piExtensions.sourcePlaceholder")}
              aria-label={t("settings.piExtensions.source")}
            />
            <Select
              value={scope}
              disabled={busy}
              onValueChange={(value) => setScope(value as "global" | "project")}
            >
              <SelectTrigger aria-label={t("settings.piExtensions.scope")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  {t("settings.piExtensions.global")}
                </SelectItem>
                <SelectItem value="project">
                  {t("settings.piExtensions.currentProject")}
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
              {t("settings.piExtensions.install")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <section className="grid gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {t("settings.piExtensions.configured")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {t(
              catalog.extensions.length === 1
                ? "settings.piExtensions.itemCountOne"
                : "settings.piExtensions.itemCountMany",
              { count: catalog.extensions.length }
            )}
          </span>
        </div>
        <div className="grid gap-1.5">
          <Input
            type="search"
            value={query}
            autoComplete="off"
            aria-label={t("settings.resources.searchLabel", {
              kind: t("settings.piExtensions.kind"),
            })}
            placeholder={t("settings.resources.searchPlaceholder", {
              kind: t("settings.piExtensions.kind"),
            })}
            onChange={(event) => {
              setQuery(event.target.value)
              setError(null)
            }}
          />
          {normalizedQuery ? (
            <p aria-live="polite" className="text-xs text-muted-foreground">
              {t("settings.resources.filteredSummary", {
                visible: visibleExtensions.length,
                total: catalog.extensions.length,
              })}
            </p>
          ) : null}
        </div>
        {visibleExtensions.length ? (
          visibleExtensions.map((ext) => (
            <Card key={ext.id} size="sm">
              <CardHeader>
                <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 break-all">
                  {ext.name}
                  <Badge variant="outline">
                    {ext.scope === "global"
                      ? t("settings.resources.global")
                      : t("settings.resources.project")}
                  </Badge>
                  {ext.status === "active" && (
                    <Badge variant="secondary" className="gap-1">
                      {getStatusIcon(ext.status)}
                      {t("settings.piExtensions.active")}
                    </Badge>
                  )}
                  {ext.status === "error" && (
                    <Badge variant="destructive" className="gap-1">
                      {getStatusIcon(ext.status)}
                      {t("settings.piExtensions.error")}
                    </Badge>
                  )}
                  {ext.updateAvailable && (
                    <Badge variant="outline">
                      {t("settings.piExtensions.updateAvailable")}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="break-all">
                  {ext.description}
                  <span className="ml-2 text-muted-foreground">
                    v{ext.version}
                  </span>
                </CardDescription>
                <CardAction className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("settings.piExtensions.update", {
                      name: ext.name,
                    })}
                    disabled={busy}
                    onClick={() => void mutate(ext.id, "update")}
                  >
                    {working === `update:${ext.id}` ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <RefreshCwIcon />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("settings.piExtensions.remove", {
                      name: ext.name,
                    })}
                    disabled={busy}
                    onClick={() => setPendingRemove(ext)}
                  >
                    {working === `remove:${ext.id}` ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <Trash2Icon />
                    )}
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>
          ))
        ) : catalog.extensions.length ? (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            {t("settings.resources.noMatches")}
          </p>
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            {t("settings.piExtensions.empty")}
          </p>
        )}
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
          title={t("settings.piExtensions.confirmRemoveTitle")}
          description={t("settings.piExtensions.confirmRemoveDescription", {
            name: pendingRemove.name,
          })}
          cancelLabel={t("settings.piExtensions.cancel")}
          confirmLabel={t("settings.piExtensions.confirmRemove")}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

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
import {
  mcpCatalogSchema,
  type McpCatalog,
  type McpServerView,
} from "@workspace/runtime-protocol"

import { McpServerCard } from "@/components/mcp-server-card"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  McpServerForm,
  type McpServerFormValue,
} from "@/components/mcp-server-form"
import { useI18n } from "@/components/i18n-provider"

interface McpProject {
  id: string
  name: string
  path: string
}

function projectQuery(projectId: string | null) {
  return projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""
}

function endpoint(path: string, projectId: string | null) {
  return `${path}${projectQuery(projectId)}`
}

export function McpSettings({
  projects,
  initialCatalog,
  mutationToken,
}: {
  projects: McpProject[]
  initialCatalog: McpCatalog
  mutationToken: string
}) {
  const { t } = useI18n()
  const router = useRouter()
  const pathname = usePathname()
  const [catalog, setCatalog] = useState(initialCatalog)
  const [editing, setEditing] = useState<McpServerView | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<McpServerView | null>(null)
  const catalogUpdateSequence = useRef(0)
  const selectedProject =
    projects.find((project) => project.id === catalog.projectId) ?? null

  useEffect(() => {
    let active = true
    const events = new EventSource("/api/v1/events")
    const refresh = async () => {
      const sequence = ++catalogUpdateSequence.current
      try {
        const response = await fetch(
          endpoint("/api/v1/mcp/servers", catalog.projectId)
        )
        const body = (await response.json()) as { error?: string }
        if (!response.ok) {
          throw new Error(body.error ?? t("settings.mcp.readFailed"))
        }
        if (active && sequence === catalogUpdateSequence.current) {
          const next = mcpCatalogSchema.parse(body)
          setCatalog((current) =>
            next.revision >= current.revision ? next : current
          )
          setError(null)
        }
      } catch (failure) {
        if (active && sequence === catalogUpdateSequence.current) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      }
    }
    const handle = () => void refresh()
    events.addEventListener("mcp.status", handle)
    events.addEventListener("resync.required", handle)
    return () => {
      active = false
      events.close()
    }
  }, [catalog.projectId, t])

  function acceptCatalog(next: McpCatalog) {
    catalogUpdateSequence.current += 1
    setCatalog((current) =>
      next.revision >= current.revision ? next : current
    )
  }

  function handleFailure(failure: unknown) {
    setError(failure instanceof Error ? failure.message : String(failure))
    router.refresh()
  }

  function mutationHeaders(includeRevision = true) {
    return {
      "Content-Type": "application/json",
      "X-Pi-Web-Codex-Mutation-Token": mutationToken,
      ...(includeRevision
        ? { "If-Match": `"revision-${catalog.revision}"` }
        : {}),
    }
  }

  async function readCatalog(response: Response) {
    const body = (await response.json()) as { error?: string }
    if (!response.ok)
      throw new Error(body.error ?? t("settings.mcp.requestFailed"))
    const next = mcpCatalogSchema.parse(body)
    acceptCatalog(next)
    return next
  }

  async function save(server: McpServerFormValue) {
    const key = editing ? `edit:${editing.id}` : "create"
    setWorking(key)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(
        endpoint(
          editing ? `/api/v1/mcp/servers/${editing.id}` : "/api/v1/mcp/servers",
          catalog.projectId
        ),
        {
          method: editing ? "PATCH" : "POST",
          headers: mutationHeaders(),
          body: JSON.stringify(
            editing ? { type: "configuration", server } : server
          ),
        }
      )
      await readCatalog(response)
      setFormOpen(false)
      setEditing(null)
      setNotice(t("settings.mcp.saved", { name: server.name }))
    } catch (failure) {
      handleFailure(failure)
    } finally {
      setWorking(null)
    }
  }

  async function patch(
    server: McpServerView,
    key: string,
    body: unknown,
    success: string
  ) {
    setWorking(key)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(
        endpoint(`/api/v1/mcp/servers/${server.id}`, catalog.projectId),
        {
          method: "PATCH",
          headers: mutationHeaders(),
          body: JSON.stringify(body),
        }
      )
      await readCatalog(response)
      setNotice(success)
    } catch (failure) {
      handleFailure(failure)
    } finally {
      setWorking(null)
    }
  }

  async function test(server: McpServerView) {
    setWorking(`test:${server.id}`)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(
        endpoint(`/api/v1/mcp/servers/${server.id}/test`, catalog.projectId),
        { method: "POST", headers: mutationHeaders(false) }
      )
      const result = (await response.json()) as {
        error?: string
        latencyMs?: number
        toolCount?: number
        catalog?: unknown
      }
      if (!response.ok) {
        throw new Error(result.error ?? t("settings.mcp.testFailed"))
      }
      const next = mcpCatalogSchema.parse(result.catalog)
      acceptCatalog(next)
      setNotice(
        t("settings.mcp.connected", {
          name: server.name,
          latency: result.latencyMs ?? 0,
          tools: result.toolCount ?? 0,
        })
      )
    } catch (failure) {
      handleFailure(failure)
    } finally {
      setWorking(null)
    }
  }

  async function reconnect(server: McpServerView) {
    setWorking(`reconnect:${server.id}`)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(
        endpoint(
          `/api/v1/mcp/servers/${server.id}/reconnect`,
          catalog.projectId
        ),
        { method: "POST", headers: mutationHeaders(false) }
      )
      await readCatalog(response)
      setNotice(t("settings.mcp.reconnected", { name: server.name }))
    } catch (failure) {
      handleFailure(failure)
    } finally {
      setWorking(null)
    }
  }

  async function remove(server: McpServerView) {
    setWorking(`delete:${server.id}`)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(
        endpoint(`/api/v1/mcp/servers/${server.id}`, catalog.projectId),
        { method: "DELETE", headers: mutationHeaders() }
      )
      await readCatalog(response)
      setNotice(t("settings.mcp.deleted", { name: server.name }))
    } catch (failure) {
      handleFailure(failure)
    } finally {
      setWorking(null)
    }
  }

  async function confirmRemove() {
    if (!pendingDelete) return
    const server = pendingDelete
    setPendingDelete(null)
    await remove(server)
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.mcp.context")}</CardTitle>
          <CardDescription>{t("settings.mcp.description")}</CardDescription>
          <CardAction>
            <Button
              type="button"
              disabled={working !== null}
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon />
              {t("settings.mcp.addServer")}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {projects.length ? (
            <div className="grid max-w-xl gap-2">
              <span className="text-sm font-medium">
                {t("settings.resources.currentProject")}
              </span>
              <Select
                value={catalog.projectId ?? undefined}
                disabled={working !== null}
                onValueChange={(value) =>
                  router.push(
                    `${pathname}?projectId=${encodeURIComponent(value)}`
                  )
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
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("settings.mcp.noProject")}
            </p>
          )}
          {selectedProject && !catalog.projectTrusted ? (
            <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
              {t("settings.mcp.untrusted")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {(["global", "project"] as const).map((scope) => {
        const servers = catalog.servers.filter(
          (server) => server.scope === scope
        )
        if (scope === "project" && !selectedProject) return null
        return (
          <section key={scope} className="grid gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-semibold">
                {scope === "global"
                  ? t("settings.mcp.globalServers")
                  : t("settings.mcp.projectServers")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t("settings.mcp.serverCount", { count: servers.length })}
              </span>
            </div>
            {servers.length ? (
              servers.map((server) => (
                <McpServerCard
                  key={server.id}
                  server={server}
                  working={working !== null}
                  projectBlocked={
                    server.scope === "project" && !catalog.projectTrusted
                  }
                  onEdit={() => {
                    setEditing(server)
                    setFormOpen(true)
                  }}
                  onTest={() => void test(server)}
                  onReconnect={() => void reconnect(server)}
                  onRemove={() => setPendingDelete(server)}
                  onToggleServer={(enabled) =>
                    void patch(
                      server,
                      `enabled:${server.id}`,
                      { type: "enabled", enabled },
                      enabled
                        ? t("settings.mcp.enabled", { name: server.name })
                        : t("settings.mcp.disabled", { name: server.name })
                    )
                  }
                  onToggleTool={(toolName, namespacedName, enabled) =>
                    void patch(
                      server,
                      `tool:${server.id}:${toolName}`,
                      { type: "tool", toolName, enabled },
                      enabled
                        ? t("settings.mcp.toolEnabled", {
                            name: namespacedName,
                          })
                        : t("settings.mcp.toolDisabled", {
                            name: namespacedName,
                          })
                    )
                  }
                />
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                {t("settings.mcp.scopeEmpty", {
                  scope: scope === "global" ? "Global" : "Project",
                })}
              </p>
            )}
          </section>
        )
      })}

      {notice ? <p className="text-sm text-success">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {formOpen ? (
        <McpServerForm
          key={editing?.id ?? "new"}
          open
          server={editing}
          selectedProjectId={catalog.projectId}
          selectedProjectName={selectedProject?.name ?? null}
          working={working !== null}
          onOpenChange={(open) => {
            setFormOpen(open)
            if (!open) setEditing(null)
          }}
          onSave={save}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null)
          }}
          title={t("settings.mcp.confirmDeleteTitle")}
          description={t("settings.mcp.deleteConfirm", {
            name: pendingDelete.name,
          })}
          cancelLabel={t("settings.mcp.cancel")}
          confirmLabel={t("settings.mcp.delete")}
          onConfirm={() => void confirmRemove()}
        />
      ) : null}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
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
import {
  McpServerForm,
  type McpServerFormValue,
} from "@/components/mcp-server-form"

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
  const router = useRouter()
  const pathname = usePathname()
  const [catalog, setCatalog] = useState(initialCatalog)
  const [editing, setEditing] = useState<McpServerView | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const selectedProject =
    projects.find((project) => project.id === catalog.projectId) ?? null

  useEffect(() => {
    let active = true
    const events = new EventSource("/api/v1/events")
    const refresh = async () => {
      try {
        const response = await fetch(
          endpoint("/api/v1/mcp/servers", catalog.projectId)
        )
        const body = (await response.json()) as { error?: string }
        if (!response.ok) {
          throw new Error(body.error ?? "读取 MCP 状态失败。")
        }
        if (active) {
          setCatalog(mcpCatalogSchema.parse(body))
          setError(null)
        }
      } catch (failure) {
        if (active) {
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
  }, [catalog.projectId])

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
    if (!response.ok) throw new Error(body.error ?? "MCP 请求失败。")
    const next = mcpCatalogSchema.parse(body)
    setCatalog(next)
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
      setNotice(`${server.name} 已保存并应用。`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
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
      setError(failure instanceof Error ? failure.message : String(failure))
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
      if (!response.ok) throw new Error(result.error ?? "MCP 测试失败。")
      setCatalog(mcpCatalogSchema.parse(result.catalog))
      setNotice(
        `${server.name} 连接正常 · ${result.latencyMs} ms · ${result.toolCount} tools`
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
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
      setNotice(`${server.name} 已重新连接。`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(null)
    }
  }

  async function remove(server: McpServerView) {
    if (!window.confirm(`删除 MCP server “${server.name}”？`)) return
    setWorking(`delete:${server.id}`)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(
        endpoint(`/api/v1/mcp/servers/${server.id}`, catalog.projectId),
        { method: "DELETE", headers: mutationHeaders() }
      )
      await readCatalog(response)
      setNotice(`${server.name} 已删除。`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>MCP context</CardTitle>
          <CardDescription>
            Global server 对所有 runtime 生效；Project server 仅注入选中项目。
          </CardDescription>
          <CardAction>
            <Button
              type="button"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon />
              添加 server
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-3">
          {projects.length ? (
            <div className="grid max-w-xl gap-2">
              <span className="text-sm font-medium">Current Project</span>
              <Select
                value={catalog.projectId ?? undefined}
                onValueChange={(value) =>
                  router.push(
                    `${pathname}?projectId=${encodeURIComponent(value)}`
                  )
                }
              >
                <SelectTrigger className="w-full" aria-label="Current Project">
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
              尚无工作区项目；仍可配置 Global MCP server。
            </p>
          )}
          {selectedProject && !catalog.projectTrusted ? (
            <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
              当前项目未受信任；Project MCP server 不会连接或注入 runtime。请在
              Extensions / Skills 页面完成项目信任。
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
                {scope === "global" ? "Global servers" : "Project servers"}
              </h2>
              <span className="text-xs text-muted-foreground">
                {servers.length} 项
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
                  onRemove={() => void remove(server)}
                  onToggleServer={(enabled) =>
                    void patch(
                      server,
                      `enabled:${server.id}`,
                      { type: "enabled", enabled },
                      `${server.name} 已${enabled ? "启用" : "停用"}。`
                    )
                  }
                  onToggleTool={(toolName, namespacedName, enabled) =>
                    void patch(
                      server,
                      `tool:${server.id}:${toolName}`,
                      { type: "tool", toolName, enabled },
                      `${namespacedName} 已${enabled ? "启用" : "停用"}。`
                    )
                  }
                />
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                尚未配置 {scope} MCP server。
              </p>
            )}
          </section>
        )
      })}

      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
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
    </div>
  )
}

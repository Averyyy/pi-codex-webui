"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import type {
  McpConfiguredValueView,
  McpServerView,
} from "@workspace/runtime-protocol"

import { McpValueEditor } from "@/components/mcp-value-editor"
import { useI18n } from "@/components/i18n-provider"

export interface McpServerFormValue {
  id: string
  name: string
  scope: "global" | "project"
  projectId: string | null
  enabled: boolean
  transport:
    | { type: "stdio"; command: string; args: string[]; cwd: string | null }
    | {
        type: "http"
        url: string
        headers: McpConfiguredValueView[]
      }
  env: McpConfiguredValueView[]
  timeoutMs: number
}

interface FormState {
  id: string
  name: string
  scope: "global" | "project"
  enabled: boolean
  transportType: "stdio" | "http"
  command: string
  argsJson: string
  cwd: string
  url: string
  headers: McpConfiguredValueView[]
  env: McpConfiguredValueView[]
  timeoutMs: string
}

function initialState(server: McpServerView | null): FormState {
  return {
    id: server?.id ?? "",
    name: server?.name ?? "",
    scope: server?.scope ?? "global",
    enabled: server?.enabled ?? true,
    transportType: server?.transport.type ?? "stdio",
    command: server?.transport.type === "stdio" ? server.transport.command : "",
    argsJson:
      server?.transport.type === "stdio"
        ? JSON.stringify(server.transport.args, null, 2)
        : "[]",
    cwd: server?.transport.type === "stdio" ? (server.transport.cwd ?? "") : "",
    url: server?.transport.type === "http" ? server.transport.url : "",
    headers:
      server?.transport.type === "http"
        ? server.transport.headers.map((value) => ({ ...value }))
        : [],
    env: server?.env.map((value) => ({ ...value })) ?? [],
    timeoutMs: String(server?.timeoutMs ?? 30_000),
  }
}

export function McpServerForm({
  open,
  server,
  selectedProjectId,
  selectedProjectName,
  working,
  onOpenChange,
  onSave,
}: {
  open: boolean
  server: McpServerView | null
  selectedProjectId: string | null
  selectedProjectName: string | null
  working: boolean
  onOpenChange: (open: boolean) => void
  onSave: (server: McpServerFormValue) => Promise<void>
}) {
  const { t } = useI18n()
  const [form, setForm] = useState(() => initialState(server))
  const [error, setError] = useState<string | null>(null)

  function field<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    let args: unknown
    try {
      args = JSON.parse(form.argsJson)
    } catch {
      setError(t("settings.mcpForm.argumentsError"))
      return
    }
    if (
      !Array.isArray(args) ||
      args.some((value) => typeof value !== "string")
    ) {
      setError(t("settings.mcpForm.argumentsTypeError"))
      return
    }
    const timeoutMs = Number(form.timeoutMs)
    if (!Number.isInteger(timeoutMs)) {
      setError(t("settings.mcpForm.timeoutError"))
      return
    }

    await onSave({
      id: form.id,
      name: form.name,
      scope: form.scope,
      projectId: form.scope === "project" ? selectedProjectId : null,
      enabled: form.enabled,
      transport:
        form.transportType === "stdio"
          ? {
              type: "stdio",
              command: form.command,
              args,
              cwd: form.cwd.trim() || null,
            }
          : { type: "http", url: form.url, headers: form.headers },
      env: form.transportType === "stdio" ? form.env : [],
      timeoutMs,
    })
  }

  return (
    <Dialog open={open} onOpenChange={working ? undefined : onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {server
              ? t("settings.mcpForm.editTitle")
              : t("settings.mcpForm.addTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.mcpForm.description")}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mcp-name">{t("settings.mcpForm.name")}</Label>
              <Input
                id="mcp-name"
                required
                value={form.name}
                onChange={(event) => field("name", event.target.value)}
                placeholder="GitHub"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mcp-id">{t("settings.mcpForm.namespace")}</Label>
              <Input
                id="mcp-id"
                required
                disabled={server !== null}
                value={form.id}
                onChange={(event) => field("id", event.target.value)}
                placeholder="github"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
              <p className="text-xs text-muted-foreground">
                {t("settings.mcpForm.toolPrefix", {
                  namespace: form.id.replaceAll("-", "_") || "namespace",
                })}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("settings.mcpForm.scope")}</Label>
              <Select
                value={form.scope}
                onValueChange={(value) =>
                  field("scope", value as "global" | "project")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="project" disabled={!selectedProjectId}>
                    Current Project
                  </SelectItem>
                </SelectContent>
              </Select>
              {form.scope === "project" ? (
                <p className="text-xs text-muted-foreground">
                  {selectedProjectName ?? t("settings.mcpForm.projectMissing")}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>{t("settings.mcpForm.transport")}</Label>
              <Select
                value={form.transportType}
                onValueChange={(value) =>
                  field("transportType", value as "stdio" | "http")
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="http">Streamable HTTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.transportType === "stdio" ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mcp-command">
                  {t("settings.mcpForm.command")}
                </Label>
                <Input
                  id="mcp-command"
                  required
                  value={form.command}
                  onChange={(event) => field("command", event.target.value)}
                  placeholder="npx"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcp-args">
                  {t("settings.mcpForm.arguments")}
                </Label>
                <Textarea
                  id="mcp-args"
                  className="min-h-24 font-mono text-xs"
                  value={form.argsJson}
                  onChange={(event) => field("argsJson", event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcp-cwd">{t("settings.mcpForm.cwd")}</Label>
                <Input
                  id="mcp-cwd"
                  value={form.cwd}
                  onChange={(event) => field("cwd", event.target.value)}
                  placeholder={t("settings.mcpForm.cwdPlaceholder")}
                />
              </div>
              <McpValueEditor
                label={t("settings.mcpForm.environment")}
                values={form.env}
                onChange={(values) => field("env", values)}
              />
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="mcp-url">URL</Label>
                <Input
                  id="mcp-url"
                  type="url"
                  required
                  value={form.url}
                  onChange={(event) => field("url", event.target.value)}
                  placeholder="https://mcp.example.com/mcp"
                />
              </div>
              <McpValueEditor
                label={t("settings.mcpForm.headers")}
                values={form.headers}
                onChange={(values) => field("headers", values)}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
            <div className="grid gap-2">
              <Label htmlFor="mcp-timeout">
                {t("settings.mcpForm.timeout")}
              </Label>
              <Input
                id="mcp-timeout"
                type="number"
                min={1000}
                max={600000}
                required
                value={form.timeoutMs}
                onChange={(event) => field("timeoutMs", event.target.value)}
              />
            </div>
            <label className="flex h-8 items-center gap-2 text-sm">
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => field("enabled", enabled)}
              />
              {t("settings.mcpForm.enableAfterSave")}
            </label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter className="mx-0 mb-0">
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => onOpenChange(false)}
            >
              {t("settings.mcpForm.cancel")}
            </Button>
            <Button type="submit" disabled={working}>
              {working
                ? t("settings.common.saving")
                : t("settings.mcpForm.saveConnecting")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

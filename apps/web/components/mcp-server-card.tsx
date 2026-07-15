"use client"

import {
  ChevronDownIcon,
  PencilIcon,
  RefreshCwIcon,
  StethoscopeIcon,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Switch } from "@workspace/ui/components/switch"
import type {
  McpConnectionStatus,
  McpServerView,
} from "@workspace/runtime-protocol"

import { useI18n } from "@/components/i18n-provider"

const statusLabel: Record<McpConnectionStatus, string> = {
  disabled: "Disabled",
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
  error: "Error",
}

function statusVariant(status: McpConnectionStatus) {
  if (status === "connected") return "secondary" as const
  if (status === "error") return "destructive" as const
  return "outline" as const
}

function transportSummary(server: McpServerView) {
  if (server.transport.type === "http") return server.transport.url
  return [server.transport.command, ...server.transport.args].join(" ")
}

export function McpServerCard({
  server,
  working,
  projectBlocked,
  onEdit,
  onTest,
  onReconnect,
  onRemove,
  onToggleServer,
  onToggleTool,
}: {
  server: McpServerView
  working: boolean
  projectBlocked: boolean
  onEdit: () => void
  onTest: () => void
  onReconnect: () => void
  onRemove: () => void
  onToggleServer: (enabled: boolean) => void
  onToggleTool: (
    toolName: string,
    namespacedName: string,
    enabled: boolean
  ) => void
}) {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {server.name}
          <Badge variant="outline">
            {server.scope === "global"
              ? t("settings.resources.global")
              : t("settings.resources.project")}
          </Badge>
          <Badge variant={statusVariant(server.status)}>
            {statusLabel[server.status]}
          </Badge>
        </CardTitle>
        <CardDescription className="font-mono text-xs break-all">
          {transportSummary(server)}
        </CardDescription>
        <CardAction>
          <Switch
            aria-label={t("settings.mcp.enableServer", { name: server.name })}
            checked={server.enabled}
            disabled={working || projectBlocked}
            onCheckedChange={onToggleServer}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working}
            onClick={onEdit}
          >
            <PencilIcon />
            {t("settings.mcp.edit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working || projectBlocked}
            onClick={onTest}
          >
            <StethoscopeIcon />
            {t("settings.mcp.testConnection")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={working || projectBlocked}
            onClick={onReconnect}
          >
            <RefreshCwIcon />
            {t("settings.mcp.reconnect")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={working}
            onClick={onRemove}
          >
            <Trash2Icon />
            {t("settings.mcp.delete")}
          </Button>
        </div>

        {server.lastConnectedAt ? (
          <p className="text-xs text-muted-foreground">
            Last connected: {server.lastConnectedAt.replace("T", " ")}
          </p>
        ) : null}
        {server.lastError ? (
          <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
            {server.lastError}
          </p>
        ) : null}

        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">
              {t("settings.mcp.discoveredTools")}
            </h3>
            <span className="text-xs text-muted-foreground">
              {t("settings.mcp.toolsEnabled", {
                enabled: server.tools.filter((tool) => tool.enabled).length,
                total: server.tools.length,
              })}
            </span>
          </div>
          {server.tools.length ? (
            server.tools.map((tool) => (
              <div
                key={tool.name}
                className="flex items-start justify-between gap-4 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {tool.title ?? tool.name}
                  </p>
                  <p className="font-mono text-xs break-all text-muted-foreground">
                    {tool.namespacedName}
                  </p>
                  {tool.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tool.description}
                    </p>
                  ) : null}
                </div>
                <Switch
                  aria-label={t("settings.mcp.enableTool", {
                    name: tool.namespacedName,
                  })}
                  checked={tool.enabled}
                  disabled={working || !server.enabled || projectBlocked}
                  onCheckedChange={(enabled) =>
                    onToggleTool(tool.name, tool.namespacedName, enabled)
                  }
                />
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {server.enabled
                ? t("settings.mcp.toolsAfterConnection")
                : t("settings.mcp.toolsAfterEnable")}
            </p>
          )}
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <ChevronDownIcon />
              {t("settings.mcp.logs", { count: server.logs.length })}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs">
            {server.logs.length ? (
              server.logs.map((log, index) => (
                <p
                  key={`${log.timestamp}:${index}`}
                  className={log.level === "error" ? "text-destructive" : ""}
                >
                  {log.timestamp} [{log.level}] {log.message}
                </p>
              ))
            ) : (
              <p className="text-muted-foreground">
                {t("settings.mcp.noLogs")}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

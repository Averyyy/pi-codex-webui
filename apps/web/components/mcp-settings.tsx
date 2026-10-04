"use client"

import { useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useI18n } from "@/components/i18n-provider"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { validatedResponseJson } from "@/lib/api-response"
import {
  nativeMcpConfigSchema,
  nativeMcpServerSchema,
  mcpSettingsSnapshotSchema,
  type McpSettingsSnapshot,
  type NativeMcpServer,
} from "@/lib/mcp-config-schema"

type Scope = "global" | "project"
type EditingServer = {
  scope: Scope
  name: string
  server: NativeMcpServer
  existing: boolean
}

const labels = {
  "zh-CN": {
    description: "Pi 原生 MCP：Pi 负责连接、认证与工具执行。",
    global: "全局服务",
    project: "项目服务",
    empty: "尚未配置服务。添加本地命令或 HTTP 地址即可开始。",
    add: "添加服务",
    edit: "编辑",
    remove: "删除",
    save: "保存",
    cancel: "取消",
    reload: "重新加载配置",
    enabled: "启用",
    name: "服务名称",
    transport: "连接方式",
    command: "可执行程序",
    args: "参数（每行一个）",
    url: "服务 URL",
    exposure: "工具使用方式",
    advanced: "高级服务选项 JSON",
    advancedHelp:
      "设置 env、headers、cwd、timeout（秒）、oauth、auth 或 toolExposure。值可以引用 ${环境变量}。",
    nativeManager:
      "在会话中发送 /mcp 查看连接状态与工具数量；使用 /mcp login 名称、/mcp logout 名称 或 /mcp reconnect 名称 管理认证与重连。",
    legacyConfig:
      "config.json 中的 {count} 个旧 WebUI MCP 服务已保留为未启用的迁移数据。使用下方表单将服务添加到 Pi 原生 mcp.json，配置路径显示在对应分组中。",
    saved: "已保存。空闲会话已重新加载，运行中的会话在本轮结束后生效。",
    trust: "项目尚未信任。Pi 会在信任后加载此项目的 MCP 配置。",
    config: "配置文件 JSON",
    configHelp:
      "完整编辑 mcp.json，包括 autoEnableCodemode。项目同名服务覆盖全局配置。",
    autoCodemode: "自动启用 Codemode",
    autoHelp: "连接使用 Codemode 的服务时，自动启用脚本工具。",
    deleteTitle: "删除 MCP 服务",
    deleteHelp: "删除此配置文件中的服务条目。",
    stdio: "本地程序 (stdio)",
    http: "Streamable HTTP",
    override: "项目覆盖",
    duplicate: "此配置文件已包含同名服务。",
    codemode: "Codemode · 脚本调用（默认）",
    deferred: "Deferred · 搜索后调用",
    direct: "Direct · 直接提供给模型",
    hidden: "Hidden · 隐藏工具",
    invalid: "配置文件包含错误。请在 JSON 编辑器中修正后保存。",
    format:
      "名称只能包含字母、数字、下划线与连字符。命令填写一个可执行程序，参数分别填写。",
  },
  "en-US": {
    description:
      "Native Pi MCP: Pi manages connections, authentication and tool execution.",
    global: "Global servers",
    project: "Project servers",
    empty:
      "No servers configured. Add a local command or HTTP URL to get started.",
    add: "Add server",
    edit: "Edit",
    remove: "Delete",
    save: "Save",
    cancel: "Cancel",
    reload: "Reload configuration",
    enabled: "Enabled",
    name: "Server name",
    transport: "Transport",
    command: "Executable",
    args: "Arguments (one per line)",
    url: "Server URL",
    exposure: "Tool exposure",
    advanced: "Advanced server options JSON",
    advancedHelp:
      "Set env, headers, cwd, timeout (seconds), oauth, auth or toolExposure. Values can reference ${ENVIRONMENT_VARIABLES}.",
    nativeManager:
      "Send /mcp in a session for connection status and tool counts. Use /mcp login name, /mcp logout name or /mcp reconnect name for authentication and reconnection.",
    legacyConfig:
      "The {count} old WebUI MCP servers in config.json are retained as inactive migration data. Add them to native Pi mcp.json using the forms below; each section shows its configuration path.",
    saved:
      "Saved. Idle sessions reloaded; running sessions apply this after the current turn.",
    trust:
      "This project is not trusted. Pi loads its MCP configuration after trust is granted.",
    config: "Configuration file JSON",
    configHelp:
      "Edit the complete mcp.json, including autoEnableCodemode. Project servers override global servers with the same name.",
    autoCodemode: "Auto-enable Codemode",
    autoHelp: "Activate the script tool when servers using Codemode connect.",
    deleteTitle: "Delete MCP server",
    deleteHelp: "Remove this server entry from its configuration file.",
    stdio: "Local program (stdio)",
    http: "Streamable HTTP",
    override: "Project override",
    duplicate: "A server with this name already exists in this file.",
    codemode: "Codemode · Script calls (default)",
    deferred: "Deferred · Discover then call",
    direct: "Direct · Declare to the model",
    hidden: "Hidden · Unreachable tools",
    invalid:
      "The configuration contains an error. Correct it in the JSON editor and save.",
    format:
      "Names use letters, digits, underscores and hyphens. Enter one executable and put its arguments on separate lines.",
  },
}

export function McpSettings({
  projects,
  initialCatalog,
  mutationToken,
  legacyMcpServerCount,
  legacyMcpConfigPath,
}: {
  projects: { id: string; name: string; path: string }[]
  initialCatalog: McpSettingsSnapshot
  mutationToken: string
  legacyMcpServerCount: number
  legacyMcpConfigPath: string
}) {
  const { locale, t } = useI18n()
  const l = labels[locale]
  const router = useRouter()
  const pathname = usePathname()
  const [catalog, setCatalog] = useState(initialCatalog)
  const [editing, setEditing] = useState<EditingServer | null>(null)
  const [deleting, setDeleting] = useState<{
    scope: Scope
    name: string
  } | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const endpoint = `/api/v1/mcp/servers${catalog.projectId ? `?projectId=${encodeURIComponent(catalog.projectId)}` : ""}`

  async function save(scope: Scope, text: string) {
    setWorking(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify({
          scope,
          text,
          expectedText: catalog.files[scope]!.text,
        }),
      })
      const next = await validatedResponseJson(
        response,
        (value) => mcpSettingsSnapshotSchema.parse(value),
        t("settings.mcp.requestFailed")
      )
      setCatalog(next)
      setNotice(l.saved)
      return true
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
      return false
    } finally {
      setWorking(false)
    }
  }

  async function changeServer(
    scope: Scope,
    name: string,
    server: NativeMcpServer | null
  ) {
    const config = nativeMcpConfigSchema.parse(
      JSON.parse(catalog.files[scope]!.text ?? "{}")
    )
    const servers = { ...config.mcpServers }
    if (server) servers[name] = server
    else delete servers[name]
    return save(
      scope,
      JSON.stringify({ ...config, mcpServers: servers }, null, 2)
    )
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>MCP</CardTitle>
          <CardDescription>{l.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 grid-cols-1 gap-3">
          {projects.length ? (
            <Select
              value={catalog.projectId ?? undefined}
              disabled={working}
              onValueChange={(value) =>
                router.push(
                  `${pathname}?projectId=${encodeURIComponent(value)}`
                )
              }
            >
              <SelectTrigger
                className="w-full max-w-xl"
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
          ) : null}
          <p className="text-sm text-muted-foreground">{l.nativeManager}</p>
          {legacyMcpServerCount > 0 ? (
            <div
              role="status"
              className="grid gap-2 rounded-lg bg-muted p-3 text-sm"
            >
              {l.legacyConfig.replace("{count}", String(legacyMcpServerCount))}
              <p className="font-mono text-xs break-all text-muted-foreground">
                {legacyMcpConfigPath}
              </p>
            </div>
          ) : null}
          <Button
            variant="outline"
            className="w-fit"
            disabled={working}
            onClick={async () => {
              setWorking(true)
              setError(null)
              try {
                const next = await validatedResponseJson(
                  await fetch(endpoint),
                  (value) => mcpSettingsSnapshotSchema.parse(value),
                  t("settings.mcp.readFailed")
                )
                setCatalog(next)
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : String(failure)
                )
              } finally {
                setWorking(false)
              }
            }}
          >
            {l.reload}
          </Button>
        </CardContent>
      </Card>
      {(["global", "project"] as const).map((scope) => {
        const file = catalog.files[scope]
        if (!file) return null
        let config: ReturnType<typeof nativeMcpConfigSchema.parse> | null = null
        let parseError: string | null = null
        try {
          config = nativeMcpConfigSchema.parse(JSON.parse(file.text ?? "{}"))
        } catch (failure) {
          parseError =
            failure instanceof Error ? failure.message : String(failure)
        }
        return (
          <section key={scope} className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{l[scope]}</h2>
              <Button
                disabled={working || config === null}
                onClick={() =>
                  setEditing({
                    scope,
                    name: "",
                    server: { command: "", exposure: "codemode" },
                    existing: false,
                  })
                }
              >
                <PlusIcon />
                {l.add}
              </Button>
            </div>
            <p className="font-mono text-xs break-all text-muted-foreground">
              {file.path}
            </p>
            {scope === "project" && !catalog.projectTrusted ? (
              <p className="rounded-lg bg-muted p-3 text-sm">{l.trust}</p>
            ) : null}
            {parseError ? (
              <p role="alert" className="text-sm text-destructive">
                {l.invalid}
                <br />
                {parseError}
              </p>
            ) : null}
            {config ? (
              <>
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor={`auto-codemode-${scope}`}>
                      {l.autoCodemode}
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {l.autoHelp}
                    </p>
                  </div>
                  <Switch
                    id={`auto-codemode-${scope}`}
                    disabled={working}
                    checked={config.autoEnableCodemode !== false}
                    onCheckedChange={(checked) =>
                      void save(
                        scope,
                        JSON.stringify(
                          { ...config, autoEnableCodemode: checked },
                          null,
                          2
                        )
                      )
                    }
                  />
                </div>
                {Object.entries(config.mcpServers ?? {}).length ? (
                  Object.entries(config.mcpServers ?? {}).map(
                    ([name, server]) => (
                      <Card key={name}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-base break-all">
                              {name}
                            </CardTitle>
                            <Switch
                              aria-label={`${l.enabled} ${name}`}
                              disabled={working}
                              checked={server.enabled !== false}
                              onCheckedChange={(checked) =>
                                void changeServer(scope, name, {
                                  ...server,
                                  enabled: checked,
                                })
                              }
                            />
                          </div>
                        </CardHeader>
                        <CardContent className="grid min-w-0 grid-cols-1 gap-3">
                          <p className="font-mono text-xs break-all text-muted-foreground">
                            {server.url ?? server.command ?? l.override}
                          </p>
                          <p className="text-sm">
                            {
                              l[
                                (server.exposure === "codemode-deferred"
                                  ? "codemode"
                                  : server.exposure) ?? "codemode"
                              ]
                            }
                          </p>
                          {server.description ? (
                            <p className="text-sm text-muted-foreground">
                              {server.description}
                            </p>
                          ) : null}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={working}
                              onClick={() =>
                                setEditing({
                                  scope,
                                  name,
                                  server,
                                  existing: true,
                                })
                              }
                            >
                              {l.edit}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={working}
                              onClick={() => setDeleting({ scope, name })}
                            >
                              {l.remove}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  )
                ) : (
                  <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                    {l.empty}
                  </p>
                )}
              </>
            ) : null}
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {l.config}
              </summary>
              <p className="my-3 text-sm text-muted-foreground">
                {l.configHelp}
              </p>
              <McpFileEditor
                key={file.text}
                text={file.text ?? '{\n  "mcpServers": {}\n}'}
                working={working}
                saveLabel={l.save}
                onSave={(text) => save(scope, text)}
              />
            </details>
          </section>
        )
      })}
      {notice ? (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {editing ? (
        <NativeMcpServerForm
          key={`${editing.scope}:${editing.name}`}
          editing={editing}
          working={working}
          existingNames={Object.keys(
            nativeMcpConfigSchema.parse(
              JSON.parse(catalog.files[editing.scope]!.text ?? "{}")
            ).mcpServers ?? {}
          )}
          onClose={() => setEditing(null)}
          onSave={async (name, server) => {
            if (await changeServer(editing.scope, name, server))
              setEditing(null)
          }}
          error={error}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title={l.deleteTitle}
          description={`${deleting.name} · ${l.deleteHelp}`}
          cancelLabel={l.cancel}
          confirmLabel={l.remove}
          onConfirm={async () => {
            const target = deleting
            setDeleting(null)
            await changeServer(target.scope, target.name, null)
          }}
        />
      ) : null}
    </div>
  )
}

function McpFileEditor({
  text,
  working,
  saveLabel,
  onSave,
}: {
  text: string
  working: boolean
  saveLabel: string
  onSave: (text: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState(text)
  return (
    <div className="grid gap-3">
      <Textarea
        aria-label="mcp.json"
        className="min-h-64 font-mono text-xs"
        value={draft}
        disabled={working}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
      />
      <Button
        className="w-fit"
        disabled={working || draft === text}
        onClick={() => void onSave(draft)}
      >
        {saveLabel}
      </Button>
    </div>
  )
}

function NativeMcpServerForm({
  editing,
  working,
  existingNames,
  onClose,
  onSave,
  error,
}: {
  editing: EditingServer
  working: boolean
  existingNames: string[]
  onClose: () => void
  onSave: (name: string, server: NativeMcpServer) => Promise<void>
  error: string | null
}) {
  const { locale } = useI18n()
  const l = labels[locale]
  const [name, setName] = useState(editing.name)
  const [transport, setTransport] = useState(
    editing.server.url
      ? "http"
      : editing.server.command !== undefined
        ? "stdio"
        : "override"
  )
  const [command, setCommand] = useState(editing.server.command ?? "")
  const [url, setUrl] = useState(editing.server.url ?? "")
  const [args, setArgs] = useState(editing.server.args?.join("\n") ?? "")
  const [exposure, setExposure] = useState(
    editing.server.exposure === "codemode-deferred"
      ? "codemode"
      : (editing.server.exposure ?? "codemode")
  )
  const [enabled, setEnabled] = useState(editing.server.enabled !== false)
  const [advanced, setAdvanced] = useState(() => {
    const rest = { ...editing.server }
    for (const key of ["type", "command", "url", "args", "exposure", "enabled"])
      delete rest[key]
    return JSON.stringify(rest, null, 2)
  })
  const [formError, setFormError] = useState<string | null>(null)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing.existing ? l.edit : l.add}</DialogTitle>
          <DialogDescription>{l.format}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            setFormError(null)
            try {
              if (!editing.existing && existingNames.includes(name))
                throw new Error(l.duplicate)
              const extras = nativeMcpServerSchema.parse(JSON.parse(advanced))
              const server = nativeMcpServerSchema.parse({
                ...extras,
                enabled,
                exposure,
                ...(transport === "stdio"
                  ? { command, args: args === "" ? [] : args.split("\n") }
                  : transport === "http"
                    ? { url }
                    : {}),
              })
              await onSave(name, server)
            } catch (failure) {
              setFormError(
                failure instanceof Error ? failure.message : String(failure)
              )
            }
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="mcp-name">{l.name}</Label>
            <Input
              id="mcp-name"
              required
              pattern="[a-zA-Z0-9_-]+"
              value={name}
              disabled={working || editing.existing}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>{l.transport}</Label>
            <Select
              value={transport}
              disabled={working}
              onValueChange={setTransport}
            >
              <SelectTrigger className="w-full" aria-label={l.transport}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">{l.stdio}</SelectItem>
                <SelectItem value="http">{l.http}</SelectItem>
                {transport === "override" ? (
                  <SelectItem value="override">{l.override}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          {transport === "stdio" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="mcp-command">{l.command}</Label>
                <Input
                  id="mcp-command"
                  required
                  value={command}
                  disabled={working}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="npx"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mcp-args">{l.args}</Label>
                <Textarea
                  id="mcp-args"
                  value={args}
                  disabled={working}
                  onChange={(event) => setArgs(event.target.value)}
                  className="font-mono text-xs"
                  placeholder={"-y\n@modelcontextprotocol/server-filesystem\n."}
                />
              </div>
            </>
          ) : transport === "http" ? (
            <div className="grid gap-2">
              <Label htmlFor="mcp-url">{l.url}</Label>
              <Input
                id="mcp-url"
                type="url"
                required
                value={url}
                disabled={working}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/mcp"
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label>{l.exposure}</Label>
            <Select
              value={exposure}
              disabled={working}
              onValueChange={(value) => setExposure(value as typeof exposure)}
            >
              <SelectTrigger className="w-full" aria-label={l.exposure}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["codemode", "deferred", "direct", "hidden"] as const).map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {l[value]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mcp-enabled">{l.enabled}</Label>
            <Switch
              id="mcp-enabled"
              checked={enabled}
              disabled={working}
              onCheckedChange={setEnabled}
            />
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              {l.advanced}
            </summary>
            <p className="my-2 text-xs text-muted-foreground">
              {l.advancedHelp}
            </p>
            <Textarea
              aria-label={l.advanced}
              value={advanced}
              disabled={working}
              onChange={(event) => setAdvanced(event.target.value)}
              className="min-h-40 font-mono text-xs"
              spellCheck={false}
            />
          </details>
          {formError || error ? (
            <p role="alert" className="text-sm text-destructive">
              {formError ?? error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={onClose}
            >
              {l.cancel}
            </Button>
            <Button type="submit" disabled={working}>
              {l.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

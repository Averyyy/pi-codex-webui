"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2Icon, LoaderCircleIcon, UnplugIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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

interface RuntimeProfileView {
  id: string
  kind: "pi" | "pi-client"
  enabled: boolean
  isDefault: boolean
  serverUrl?: string
  hasAuthToken?: boolean
}

interface RuntimeSettingsView {
  revision: number
  defaultProfileId: string
  profiles: RuntimeProfileView[]
}

interface DiagnosticResult {
  ok: true
  latencyMs: number
  sessionCount?: number
}

function piClientProfile(profiles: RuntimeProfileView[]) {
  const profile = profiles.find((candidate) => candidate.kind === "pi-client")
  if (!profile) throw new Error("Pi Client runtime profile is missing.")
  return profile
}

export function RuntimeSettingsForm({
  initial,
  mutationToken,
}: {
  initial: RuntimeSettingsView
  mutationToken: string
}) {
  const [saved, setSaved] = useState(initial)
  const savedClient = useMemo(() => piClientProfile(saved.profiles), [saved])

  const [enabled, setEnabled] = useState(savedClient.enabled)
  const [serverUrl, setServerUrl] = useState(savedClient.serverUrl ?? "")
  const [defaultProfileId, setDefaultProfileId] = useState(
    saved.defaultProfileId
  )
  const [authToken, setAuthToken] = useState("")
  const [clearAuthToken, setClearAuthToken] = useState(false)
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null)
  const [saving, startSaving] = useTransition()
  const [testing, startTesting] = useTransition()
  const router = useRouter()
  const dirty =
    enabled !== savedClient.enabled ||
    serverUrl !== (savedClient.serverUrl ?? "") ||
    defaultProfileId !== saved.defaultProfileId ||
    authToken.length > 0 ||
    clearAuthToken

  function updateEnabled(next: boolean) {
    setEnabled(next)
    if (!next && defaultProfileId === savedClient.id) {
      setDefaultProfileId("pi")
    }
  }

  function updateDefault(profileId: string) {
    setDefaultProfileId(profileId)
    if (profileId === savedClient.id) setEnabled(true)
  }

  function save() {
    startSaving(async () => {
      try {
        const response = await fetch(
          `/api/v1/runtimes/${encodeURIComponent(savedClient.id)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "If-Match": `"revision-${saved.revision}"`,
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
            body: JSON.stringify({
              enabled,
              serverUrl,
              defaultProfileId,
              ...(authToken ? { authToken } : {}),
              clearAuthToken,
            }),
          }
        )
        const result = (await response.json()) as RuntimeSettingsView & {
          error?: string
        }
        if (!response.ok) throw new Error(result.error ?? "保存失败。")

        setSaved(result)
        const client = piClientProfile(result.profiles)
        setEnabled(client.enabled)
        setServerUrl(client.serverUrl ?? "")
        setDefaultProfileId(result.defaultProfileId)
        setAuthToken("")
        setClearAuthToken(false)
        setDiagnostic(null)
        router.refresh()
        toast.success("Agent runtime 设置已保存。")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败。")
      }
    })
  }

  function testConnection() {
    startTesting(async () => {
      setDiagnostic(null)
      try {
        const response = await fetch(
          `/api/v1/runtimes/${encodeURIComponent(savedClient.id)}/test`,
          {
            method: "POST",
            headers: {
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
          }
        )
        const result = (await response.json()) as DiagnosticResult & {
          error?: string
        }
        if (!response.ok) throw new Error(result.error ?? "连接测试失败。")
        setDiagnostic(result)
        toast.success("Pi Server 连接正常。")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "连接测试失败。")
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent Runtime</CardTitle>
        <CardDescription>
          默认 runtime 只作用于新 session；已有 session 始终保留原绑定。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="default-runtime">
                新 session 默认值
              </FieldLabel>
              <FieldDescription>
                创建时可显式覆盖；不会根据环境变量、端口或进程自动推断。
              </FieldDescription>
            </FieldContent>
            <Select value={defaultProfileId} onValueChange={updateDefault}>
              <SelectTrigger id="default-runtime" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="pi">Pi</SelectItem>
                  <SelectItem value={savedClient.id}>Pi Client</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>

          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>启用 Pi Client</FieldTitle>
              <FieldDescription>
                使用独立 worker 连接指定的 Pi Server；Pi worker 会清除全部
                PI_SERVER_* 变量。
              </FieldDescription>
            </FieldContent>
            <Switch
              checked={enabled}
              onCheckedChange={updateEnabled}
              aria-label="启用 Pi Client"
            />
          </Field>

          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="pi-server-url">Pi Server URL</FieldLabel>
              <FieldDescription>
                例如 http://127.0.0.1:4217；启用 Pi Client 时必填。
              </FieldDescription>
            </FieldContent>
            <Input
              id="pi-server-url"
              type="url"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="http://127.0.0.1:4217"
              className="w-full max-w-sm"
            />
          </Field>

          <Field orientation="responsive">
            <FieldContent>
              <div className="flex items-center gap-2">
                <FieldLabel htmlFor="pi-server-token">
                  Authentication token
                </FieldLabel>
                {savedClient.hasAuthToken && !clearAuthToken ? (
                  <Badge variant="secondary">已安全保存</Badge>
                ) : null}
              </div>
              <FieldDescription>
                Token 只写入权限为 0600 的 secrets 文件，不进入 config.json。
              </FieldDescription>
            </FieldContent>
            <div className="flex w-full max-w-sm items-center gap-2">
              <Input
                id="pi-server-token"
                type="password"
                value={authToken}
                onChange={(event) => {
                  setAuthToken(event.target.value)
                  if (event.target.value) setClearAuthToken(false)
                }}
                placeholder={
                  savedClient.hasAuthToken ? "留空以保留已保存 token" : "可选"
                }
              />
              {savedClient.hasAuthToken ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setClearAuthToken((current) => !current)
                    setAuthToken("")
                  }}
                >
                  {clearAuthToken ? "保留" : "移除"}
                </Button>
              ) : null}
            </div>
          </Field>

          {diagnostic ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
              <CheckCircle2Icon className="size-4 text-emerald-600" />
              Pi Server 响应正常 · {diagnostic.latencyMs} ms
              {diagnostic.sessionCount === undefined
                ? null
                : ` · ${diagnostic.sessionCount} sessions`}
            </div>
          ) : null}
        </FieldGroup>
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={testConnection}
          disabled={testing || dirty || !savedClient.serverUrl}
          title={dirty ? "请先保存当前更改" : undefined}
        >
          {testing ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <UnplugIcon />
          )}
          测试已保存配置
        </Button>
        <Button type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </CardFooter>
    </Card>
  )
}

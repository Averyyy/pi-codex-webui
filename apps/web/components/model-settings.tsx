"use client"

import { useState } from "react"
import { LoaderCircleIcon, Trash2Icon } from "lucide-react"

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
import { Switch } from "@workspace/ui/components/switch"
import {
  modelSettingsSchema,
  type ModelSettings,
  type ModelSettingsModel,
} from "@workspace/runtime-protocol"

function modelKey(model: Pick<ModelSettingsModel, "provider" | "id">) {
  return `${model.provider}/${model.id}`
}

function query(sessionId: string | null) {
  return sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""
}

function authLabel(auth: ModelSettings["providers"][number]["auth"]) {
  if (auth === "oauth") return "OAuth"
  if (auth === "api-key") return "API key"
  return "环境变量"
}

export function ModelSettings({
  initial,
  mutationToken,
  sessionId,
}: {
  initial: ModelSettings
  mutationToken: string
  sessionId: string | null
}) {
  const [settings, setSettings] = useState(initial)
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function readSettings(response: Response) {
    const body = (await response.json()) as { error?: string }
    if (!response.ok) throw new Error(body.error ?? "模型设置操作失败。")
    return modelSettingsSchema.parse(body)
  }

  async function setModelEnabled(model: ModelSettingsModel, enabled: boolean) {
    const enabledIds = new Set(
      settings.models.filter((entry) => entry.enabled).map(modelKey)
    )
    const key = modelKey(model)
    if (enabled) enabledIds.add(key)
    else enabledIds.delete(key)

    setWorking(key)
    setError(null)
    try {
      const next = await readSettings(
        await fetch(`/api/v1/model-settings${query(sessionId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({ enabledModelIds: [...enabledIds] }),
        })
      )
      setSettings(next)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(null)
    }
  }

  async function removeProvider(provider: string) {
    if (!window.confirm(`删除 provider “${provider}”？`)) return

    setWorking(provider)
    setError(null)
    try {
      const next = await readSettings(
        await fetch(
          `/api/v1/model-settings/providers/${encodeURIComponent(provider)}${query(sessionId)}`,
          {
            method: "DELETE",
            headers: {
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
          }
        )
      )
      setSettings(next)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(null)
    }
  }

  const enabledCount = settings.models.filter((model) => model.enabled).length
  const hasScope = Boolean(settings.enabledModels?.length)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Provider / Model scope</CardTitle>
          <CardDescription>
            只显示当前 Pi 已配置认证的模型。启用 scope 后，session 下拉框与 Pi
            的模型选择器使用同一组模型。
          </CardDescription>
          <CardAction>
            <Badge variant={hasScope ? "default" : "outline"}>
              {hasScope ? "已启用 scope" : "全部可用模型"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          已启用 {enabledCount} / {settings.models.length} 个模型；切换模型后，
          thinking level 会由 Pi 按该模型能力自动调整。
        </CardContent>
      </Card>

      {error ? (
        <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {settings.providers.length ? (
        settings.providers.map((provider) => {
          const models = settings.models.filter(
            (model) => model.provider === provider.provider
          )
          return (
            <Card key={provider.provider}>
              <CardHeader className="border-b">
                <CardTitle>{provider.provider}</CardTitle>
                <CardDescription>
                  {provider.modelCount} 个可用模型
                </CardDescription>
                <CardAction className="flex items-center gap-2">
                  <Badge variant="outline">{authLabel(provider.auth)}</Badge>
                  {provider.removable ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`删除 ${provider.provider}`}
                      disabled={working !== null}
                      onClick={() => void removeProvider(provider.provider)}
                    >
                      {working === provider.provider ? (
                        <LoaderCircleIcon className="animate-spin" />
                      ) : (
                        <Trash2Icon />
                      )}
                    </Button>
                  ) : null}
                </CardAction>
              </CardHeader>
              <CardContent className="divide-y p-0">
                {models.length ? (
                  models.map((model) => {
                    const key = modelKey(model)
                    return (
                      <label
                        className="flex items-center justify-between gap-4 px-4 py-3"
                        key={key}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {model.name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {model.id}
                          </span>
                        </span>
                        <Switch
                          checked={model.enabled}
                          disabled={working !== null}
                          aria-label={`启用 ${model.name}`}
                          onCheckedChange={(enabled) =>
                            void setModelEnabled(model, enabled)
                          }
                        />
                      </label>
                    )
                  })
                ) : (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    没有当前可用模型。
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          当前没有已认证的 provider/model。
        </p>
      )}
    </div>
  )
}

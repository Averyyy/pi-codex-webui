"use client"

import { useState } from "react"
import {
  ChevronDownIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import {
  modelSettingsSchema,
  type ModelSettings,
  type ModelSettingsModel,
  type ModelSettingsProvider,
  type ModelSettingsProviderInput,
} from "@workspace/runtime-protocol"
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

import { CustomProviderForm } from "@/components/custom-provider-form"

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

function providerDescription(provider: ModelSettingsProvider) {
  if (provider.modelCount > 0) return `${provider.modelCount} 个可用模型`
  if (provider.customModels.length > 0) {
    return `${provider.customModels.length} 个模型，尚未配置认证`
  }
  return "没有可用模型"
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
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(
    () => new Set()
  )
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] =
    useState<ModelSettingsProvider | null>(null)

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

  async function saveProvider(input: ModelSettingsProviderInput) {
    const provider = editingProvider?.provider ?? input.provider
    setWorking(`provider-save:${provider}`)
    setError(null)
    try {
      const endpoint = editingProvider
        ? `/api/v1/model-settings/providers/${encodeURIComponent(provider)}${query(sessionId)}`
        : `/api/v1/model-settings/providers${query(sessionId)}`
      const next = await readSettings(
        await fetch(endpoint, {
          method: editingProvider ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify(input),
        })
      )
      setSettings(next)
      setProviderDialogOpen(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(null)
    }
  }

  async function removeProvider(provider: string) {
    const providerView = settings.providers.find(
      (entry) => entry.provider === provider
    )
    const suffix = providerView?.custom ? "及其自定义配置" : "的本地认证"
    if (!window.confirm(`删除 provider “${provider}”${suffix}？`)) return

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

  function openAddProvider() {
    setEditingProvider(null)
    setError(null)
    setProviderDialogOpen(true)
  }

  function openEditProvider(provider: ModelSettingsProvider) {
    setEditingProvider(provider)
    setError(null)
    setProviderDialogOpen(true)
  }

  const enabledCount = settings.models.filter((model) => model.enabled).length
  const hasScope = Boolean(settings.enabledModels?.length)

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Provider / Model scope</CardTitle>
          <CardDescription>
            模型 scope 只作用于当前 Pi 已配置认证的模型；自定义 provider
            也可以在这里添加和编辑。
          </CardDescription>
          <CardAction className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openAddProvider}
            >
              <PlusIcon />
              添加自定义 provider
            </Button>
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
            <Card key={provider.provider} className="overflow-hidden">
              <details
                open={!collapsedProviders.has(provider.provider)}
                className="group"
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open
                  setCollapsedProviders((current) => {
                    const next = new Set(current)
                    if (isOpen) next.delete(provider.provider)
                    else next.add(provider.provider)
                    return next
                  })
                }}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden">
                  <ChevronDownIcon className="size-4 shrink-0 transition-transform group-open:rotate-180" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {provider.name ?? provider.provider}
                    </span>
                    {provider.name ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {provider.provider}
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {providerDescription(provider)}
                    </span>
                  </span>
                  <span
                    className="flex shrink-0 items-center gap-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Badge variant="outline">{authLabel(provider.auth)}</Badge>
                    {provider.custom ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`编辑 ${provider.provider}`}
                        disabled={working !== null}
                        onClick={(event) => {
                          event.preventDefault()
                          openEditProvider(provider)
                        }}
                      >
                        <PencilIcon />
                      </Button>
                    ) : null}
                    {provider.removable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`删除 ${provider.provider}`}
                        disabled={working !== null}
                        onClick={(event) => {
                          event.preventDefault()
                          void removeProvider(provider.provider)
                        }}
                      >
                        {working === provider.provider ? (
                          <LoaderCircleIcon className="animate-spin" />
                        ) : (
                          <Trash2Icon />
                        )}
                      </Button>
                    ) : null}
                  </span>
                </summary>
                <CardContent className="divide-y border-t p-0">
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
                      {provider.customModels.length
                        ? "已保存模型，但当前没有可用认证。"
                        : "没有当前可用模型。"}
                    </p>
                  )}
                </CardContent>
              </details>
            </Card>
          )
        })
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          当前没有已配置的 provider/model。
        </p>
      )}

      {providerDialogOpen ? (
        <CustomProviderForm
          open
          provider={editingProvider}
          working={working?.startsWith("provider-save:") ?? false}
          onOpenChange={setProviderDialogOpen}
          onSave={(value) => void saveProvider(value)}
        />
      ) : null}
    </div>
  )
}

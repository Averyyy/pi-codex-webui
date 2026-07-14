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
import type {
  ModelProviderApi,
  ModelSettingsCustomModel,
  ModelSettingsProvider,
  ModelSettingsProviderInput,
} from "@workspace/runtime-protocol"

type FormModel = Omit<
  ModelSettingsCustomModel,
  "contextWindow" | "maxTokens"
> & {
  contextWindow: string
  maxTokens: string
}

interface FormState {
  provider: string
  name: string
  api: ModelProviderApi
  baseUrl: string
  apiKey: string
  models: FormModel[]
}

function emptyModel(): FormModel {
  return {
    id: "",
    name: "",
    reasoning: false,
    input: ["text"],
    contextWindow: "128000",
    maxTokens: "16384",
  }
}

function initialState(provider: ModelSettingsProvider | null): FormState {
  return {
    provider: provider?.provider ?? "",
    name: provider?.name ?? "",
    api: provider?.api ?? "openai-completions",
    baseUrl: provider?.baseUrl ?? "",
    apiKey: "",
    models: provider?.customModels.length
      ? provider.customModels.map((model) => ({
          ...model,
          contextWindow: String(model.contextWindow),
          maxTokens: String(model.maxTokens),
        }))
      : [emptyModel()],
  }
}

export function CustomProviderForm({
  open,
  provider,
  working,
  onOpenChange,
  onSave,
}: {
  open: boolean
  provider: ModelSettingsProvider | null
  working: boolean
  onOpenChange: (open: boolean) => void
  onSave: (value: ModelSettingsProviderInput) => void
}) {
  const [form, setForm] = useState(() => initialState(provider))

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function modelField(index: number, values: Partial<FormModel>) {
    setForm((current) => ({
      ...current,
      models: current.models.map((model, modelIndex) =>
        modelIndex === index ? { ...model, ...values } : model
      ),
    }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSave({
      provider: form.provider.trim(),
      name: form.name.trim() || undefined,
      api: form.api,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey || undefined,
      models: form.models.map((model) => ({
        id: model.id.trim(),
        name: model.name.trim() || model.id.trim(),
        reasoning: model.reasoning,
        input: model.input,
        contextWindow: Number(model.contextWindow),
        maxTokens: Number(model.maxTokens),
      })),
    })
  }

  return (
    <Dialog open={open} onOpenChange={working ? undefined : onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {provider ? "编辑自定义 provider" : "添加自定义 provider"}
          </DialogTitle>
          <DialogDescription>
            配置会写入 Pi 的 models.json。API key 留空会保留已有凭据。
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="custom-provider-id">Provider ID</Label>
              <Input
                id="custom-provider-id"
                required
                disabled={provider !== null}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
                value={form.provider}
                onChange={(event) => field("provider", event.target.value)}
                placeholder="my-provider"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-provider-name">显示名称（可选）</Label>
              <Input
                id="custom-provider-name"
                value={form.name}
                onChange={(event) => field("name", event.target.value)}
                placeholder="My Provider"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>API</Label>
              <Select
                value={form.api}
                onValueChange={(value) =>
                  field("api", value as ModelProviderApi)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-completions">
                    OpenAI Completions
                  </SelectItem>
                  <SelectItem value="openai-responses">
                    OpenAI Responses
                  </SelectItem>
                  <SelectItem value="anthropic-messages">
                    Anthropic Messages
                  </SelectItem>
                  <SelectItem value="google-generative-ai">
                    Google Generative AI
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-provider-base-url">Base URL</Label>
              <Input
                id="custom-provider-base-url"
                type="url"
                required
                value={form.baseUrl}
                onChange={(event) => field("baseUrl", event.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="custom-provider-api-key">API key</Label>
            <Input
              id="custom-provider-api-key"
              type="password"
              value={form.apiKey}
              onChange={(event) => field("apiKey", event.target.value)}
              placeholder={
                provider?.apiKeyConfigured ? "已配置，留空保持不变" : "可选"
              }
              autoComplete="new-password"
            />
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Models</Label>
                <p className="text-xs text-muted-foreground">
                  每个 model 使用 provider 的 API 和 Base URL。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => field("models", [...form.models, emptyModel()])}
              >
                添加 model
              </Button>
            </div>
            <div className="grid gap-3">
              {form.models.map((model, index) => (
                <div className="grid gap-3 rounded-lg border p-3" key={index}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`custom-model-id-${index}`}>
                        Model ID
                      </Label>
                      <Input
                        id={`custom-model-id-${index}`}
                        required
                        value={model.id}
                        onChange={(event) =>
                          modelField(index, { id: event.target.value })
                        }
                        placeholder="model-id"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`custom-model-name-${index}`}>
                        显示名称（可选）
                      </Label>
                      <Input
                        id={`custom-model-name-${index}`}
                        value={model.name}
                        onChange={(event) =>
                          modelField(index, { name: event.target.value })
                        }
                        placeholder="Model name"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor={`custom-model-context-${index}`}>
                        Context window
                      </Label>
                      <Input
                        id={`custom-model-context-${index}`}
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={model.contextWindow}
                        onChange={(event) =>
                          modelField(index, {
                            contextWindow: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`custom-model-max-tokens-${index}`}>
                        Max output tokens
                      </Label>
                      <Input
                        id={`custom-model-max-tokens-${index}`}
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={model.maxTokens}
                        onChange={(event) =>
                          modelField(index, { maxTokens: event.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={model.reasoning}
                        onCheckedChange={(reasoning) =>
                          modelField(index, { reasoning })
                        }
                      />
                      支持推理
                    </label>
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={model.input.includes("image")}
                        onCheckedChange={(images) =>
                          modelField(index, {
                            input: images ? ["text", "image"] : ["text"],
                          })
                        }
                      />
                      支持图片
                    </label>
                    {form.models.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() =>
                          field(
                            "models",
                            form.models.filter(
                              (_, modelIndex) => modelIndex !== index
                            )
                          )
                        }
                      >
                        删除
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0">
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={working}>
              {working ? "保存中…" : "保存 provider"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

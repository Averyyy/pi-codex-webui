"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  BugIcon,
  CircleAlertIcon,
  FolderIcon,
  GitPullRequestIcon,
  HammerIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchCodeIcon,
  SparklesIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  modelSettingsSchema,
  type ModelSettings,
  type ModelSettingsModel,
  type RuntimeModel,
  type ThinkingLevel,
} from "@workspace/runtime-protocol"

import { AddProjectDialog } from "@/components/add-project-dialog"
import {
  ComposerModelSelect,
  ComposerThinkingSelect,
  ConversationComposer,
  nextThinkingLevel,
} from "@/components/conversation-composer"

const NO_PROJECT = "__none__"

interface NewConversationProject {
  id: string
  name: string
  path: string
}

interface CreatedSession {
  projectId: string | null
  sessionId: string
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

async function responseJson<T>(response: Response) {
  const result = (await response.json()) as T & {
    error?: string
    code?: string
  }
  if (!response.ok) {
    throw new ApiError(
      result.error ?? `操作失败（HTTP ${response.status}）。`,
      result.code
    )
  }
  return result
}

function modelKey(model: Pick<RuntimeModel, "provider" | "id">) {
  return `${model.provider}/${model.id}`
}

function enabledModels(settings: ModelSettings) {
  return settings.models.filter((model) => model.enabled)
}

function initialModel(settings: ModelSettings) {
  const models = enabledModels(settings)
  return (
    models.find(
      (model) =>
        settings.defaultModel !== null &&
        modelKey(model) === modelKey(settings.defaultModel)
    ) ??
    models[0] ??
    null
  )
}

const STARTERS = [
  { icon: SearchCodeIcon, label: "探索并理解代码" },
  { icon: HammerIcon, label: "构建新功能、应用或工具" },
  { icon: GitPullRequestIcon, label: "审查代码并提出修改建议" },
  { icon: BugIcon, label: "修复问题和失败" },
] as const

export function NewConversation({
  projects,
  initialProjectId,
  initialModelSettings,
  mutationToken,
}: {
  projects: NewConversationProject[]
  initialProjectId: string | null
  initialModelSettings: ModelSettings
  mutationToken: string
}) {
  const router = useRouter()
  const [projectId, setProjectId] = useState(initialProjectId)
  const [modelSettings, setModelSettings] = useState(initialModelSettings)
  const [model, setModel] = useState<ModelSettingsModel | null>(() =>
    initialModel(initialModelSettings)
  )
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel | null>(
    () => initialModel(initialModelSettings)?.defaultThinkingLevel ?? null
  )
  const [message, setMessage] = useState("")
  const [projectSelectOpen, setProjectSelectOpen] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const selectedProject = projects.find((project) => project.id === projectId)
  const models = enabledModels(modelSettings)

  async function selectProject(value: string) {
    const nextProjectId = value === NO_PROJECT ? null : value
    setProjectId(nextProjectId)
    setLoadingModels(true)
    setError(null)
    try {
      const search = nextProjectId
        ? `projectId=${encodeURIComponent(nextProjectId)}`
        : "newTask=1"
      const nextSettings = modelSettingsSchema.parse(
        await responseJson<ModelSettings>(
          await fetch(`/api/v1/model-settings?${search}`, {
            cache: "no-store",
          })
        )
      )
      setModelSettings(nextSettings)
      const nextModel = initialModel(nextSettings)
      setModel(nextModel)
      setThinkingLevel(nextModel?.defaultThinkingLevel ?? null)
    } catch (failure) {
      setModel(null)
      setThinkingLevel(null)
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError(
              failure instanceof Error ? failure.message : String(failure)
            )
      )
    } finally {
      setLoadingModels(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    if (!text || submitting || loadingModels) return

    setSubmitting(true)
    setError(null)
    try {
      const created = await responseJson<CreatedSession>(
        await fetch(
          projectId === null
            ? "/api/v1/tasks"
            : `/api/v1/projects/${encodeURIComponent(projectId)}/sessions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
            body: JSON.stringify({
              message: text,
              ...(model
                ? { model: { provider: model.provider, modelId: model.id } }
                : {}),
              ...(thinkingLevel ? { thinkingLevel } : {}),
            }),
          }
        )
      )

      router.push(
        created.projectId === null
          ? `/tasks/${created.sessionId}`
          : `/projects/${created.projectId}/sessions/${created.sessionId}`
      )
      router.refresh()
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError(
              failure instanceof Error ? failure.message : String(failure)
            )
      )
    } finally {
      setSubmitting(false)
    }
  }

  const modelUnavailable = error?.code === "ModelUnavailable"

  return (
    <main className="flex min-h-[calc(100svh-3rem)] flex-col px-4 py-6 md:min-h-svh md:px-8 md:py-8">
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <SparklesIcon className="size-7 text-muted-foreground" />
          <h1 className="max-w-3xl text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
            {selectedProject ? (
              <>
                我们应该在{" "}
                <span className="underline decoration-border underline-offset-8">
                  {selectedProject.name}
                </span>{" "}
                中构建什么？
              </>
            ) : (
              "你想让 Pi 做什么？"
            )}
          </h1>
        </div>

        <div className="grid w-full max-w-4xl grid-cols-2 gap-3 lg:grid-cols-4">
          {STARTERS.map(({ icon: Icon, label }) => (
            <Button
              key={label}
              type="button"
              variant="outline"
              className="h-24 items-start justify-between p-4 text-left whitespace-normal sm:h-28 sm:flex-col"
              onClick={() => setMessage(label)}
            >
              <Icon />
              <span>{label}</span>
            </Button>
          ))}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-3">
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 break-words">
              {modelUnavailable
                ? "当前模型不可用。请先配置 Provider 凭据或选择可用模型。"
                : error.message}
            </p>
            {modelUnavailable ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/models">去设置</Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <ConversationComposer
          value={message}
          onValueChange={setMessage}
          onSubmit={submit}
          placeholder="描述你想构建或解决的问题"
          ariaLabel="第一条消息"
          autoFocus
          submitting={submitting}
          sendDisabled={loadingModels}
          onCycleThinkingLevel={
            model &&
            thinkingLevel &&
            model.availableThinkingLevels.length > 1 &&
            !loadingModels &&
            !submitting
              ? () =>
                  setThinkingLevel(
                    nextThinkingLevel(
                      thinkingLevel,
                      model.availableThinkingLevels
                    )
                  )
              : undefined
          }
          className="shadow-lg shadow-foreground/5"
          actions={
            loadingModels ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LoaderCircleIcon className="size-3 animate-spin" />
                正在加载模型
              </span>
            ) : null
          }
          settings={
            <>
              <Select
                open={projectSelectOpen}
                onOpenChange={setProjectSelectOpen}
                value={projectId ?? NO_PROJECT}
                onValueChange={(value) => void selectProject(value)}
                disabled={submitting}
              >
                <SelectTrigger
                  size="sm"
                  className="max-w-64"
                  aria-label="工作项目"
                >
                  <FolderIcon />
                  <SelectValue>
                    {selectedProject?.name ?? "独立任务"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  side="top"
                  className="max-w-[min(32rem,calc(100vw-2rem))]"
                  footer={
                    <Button
                      type="button"
                      className="w-full justify-start"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setProjectSelectOpen(false)
                        setAddProjectOpen(true)
                      }}
                    >
                      <PlusIcon />
                      添加项目
                    </Button>
                  }
                >
                  <SelectGroup>
                    <SelectItem value={NO_PROJECT}>独立任务</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} · {project.path}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <ComposerModelSelect
                model={model}
                models={models}
                onModelChange={(nextModel) => {
                  setModel(nextModel)
                  setThinkingLevel(nextModel.defaultThinkingLevel)
                }}
                disabled={loadingModels || submitting}
                settingsHref="/settings/models"
              />
              {model && thinkingLevel ? (
                <ComposerThinkingSelect
                  level={thinkingLevel}
                  levels={model.availableThinkingLevels}
                  onLevelChange={setThinkingLevel}
                  disabled={loadingModels || submitting}
                />
              ) : null}
            </>
          }
        />
      </div>
      <AddProjectDialog
        open={addProjectOpen}
        onOpenChange={setAddProjectOpen}
        mutationToken={mutationToken}
        onAdded={(project) =>
          router.replace(`/new?projectId=${encodeURIComponent(project.id)}`)
        }
      />
    </main>
  )
}

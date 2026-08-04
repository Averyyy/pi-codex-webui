"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
  BugIcon,
  CircleAlertIcon,
  FolderIcon,
  GitPullRequestIcon,
  HammerIcon,
  LoaderCircleIcon,
  Minimize2Icon,
  PlusIcon,
  RefreshCwIcon,
  SearchCodeIcon,
  SparklesIcon,
  TargetIcon,
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
  type ModelSettings,
  type ModelSettingsModel,
  type RuntimeModel,
  type ThinkingLevel,
} from "@workspace/runtime-protocol"

import {
  promptImages,
  useComposerImages,
} from "@/components/composer-image-attachments"
import {
  ComposerModelSelect,
  ComposerThinkingSelect,
  ConversationComposer,
  nextThinkingLevel,
} from "@/components/conversation-composer"
import { useSessionComposerDraftStore } from "@/components/session-composer-draft-context"
import { ApiError, responseJson } from "@/lib/api-response"
import { useI18n } from "@/components/i18n-provider"
import { pickWorkspaceProject } from "@/lib/project-picker-client"
import type { ComposerImage } from "@/lib/prompt-images"
import {
  draftAfterAcceptedSend,
  NEW_CONVERSATION_DRAFT_ID,
} from "@/lib/session-composer-draft-store"

const NO_PROJECT = "__none__"

function noop() {}

interface NewConversationProject {
  id: string
  name: string
  path: string
}

interface CreatedSession {
  projectId: string | null
  sessionId: string
}

interface ModelSelection {
  projectId: string | null
  settings: ModelSettings
  model: ModelSettingsModel | null
  thinkingLevel: ThinkingLevel | null
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
  {
    icon: SearchCodeIcon,
    labelKey: "home.starter.explore",
    iconClassName: "bg-tool-read/10 text-tool-read",
  },
  {
    icon: HammerIcon,
    labelKey: "home.starter.build",
    iconClassName: "bg-tool-execute/10 text-tool-execute",
  },
  {
    icon: GitPullRequestIcon,
    labelKey: "home.starter.review",
    iconClassName: "bg-tool-web/10 text-tool-web",
  },
  {
    icon: BugIcon,
    labelKey: "home.starter.fix",
    iconClassName: "bg-tool-write/10 text-tool-write",
  },
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
  const { t } = useI18n()
  const composerDraftStore = useSessionComposerDraftStore()
  const projectId = initialProjectId
  const [modelSelection, setModelSelection] = useState<ModelSelection>(() => {
    const model = initialModel(initialModelSettings)
    return {
      projectId: initialProjectId,
      settings: initialModelSettings,
      model,
      thinkingLevel: model?.defaultThinkingLevel ?? null,
    }
  })
  if (
    modelSelection.projectId !== initialProjectId ||
    modelSelection.settings !== initialModelSettings
  ) {
    const available = enabledModels(initialModelSettings)
    const selected = modelSelection.model
    const previous = selected
      ? available.find(
          (candidate) => modelKey(candidate) === modelKey(selected)
        )
      : null
    const sameProject = modelSelection.projectId === initialProjectId
    const model =
      sameProject && previous ? previous : initialModel(initialModelSettings)
    const previousThinking = modelSelection.thinkingLevel
    setModelSelection({
      projectId: initialProjectId,
      settings: initialModelSettings,
      model,
      thinkingLevel:
        sameProject &&
        model &&
        previousThinking &&
        model.availableThinkingLevels.includes(previousThinking)
          ? previousThinking
          : (model?.defaultThinkingLevel ?? null),
    })
  }
  const { model, thinkingLevel } = modelSelection
  const [initialComposerDraft] = useState(() =>
    composerDraftStore.read(NEW_CONVERSATION_DRAFT_ID)
  )
  const [message, setMessageState] = useState(initialComposerDraft.text)
  const messageRef = useRef(initialComposerDraft.text)
  const setMessage = useCallback(
    (nextMessage: string) => {
      messageRef.current = nextMessage
      composerDraftStore.setText(NEW_CONVERSATION_DRAFT_ID, nextMessage)
      setMessageState(nextMessage)
    },
    [composerDraftStore]
  )
  const [projectSelectOpen, setProjectSelectOpen] = useState(false)
  const [addingProject, setAddingProject] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [loadingModels, startProjectTransition] = useTransition()
  const [error, setError] = useState<ApiError | null>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const projectSelectTriggerRef = useRef<HTMLButtonElement>(null)
  const pendingProjectChangeRef = useRef<{ projectId: string | null } | null>(
    null
  )
  const updateStoredComposerImages = useCallback(
    (images: ComposerImage[]) =>
      composerDraftStore.setImages(NEW_CONVERSATION_DRAFT_ID, images),
    [composerDraftStore]
  )
  const composerImages = useComposerImages(
    initialComposerDraft.images,
    updateStoredComposerImages
  )
  const selectedProject = projects.find((project) => project.id === projectId)
  const models = enabledModels(initialModelSettings)

  useEffect(() => {
    if (
      window.matchMedia(
        "(min-width: 768px) and (hover: hover) and (pointer: fine)"
      ).matches
    ) {
      messageInputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    if (loadingModels) return
    const pending = pendingProjectChangeRef.current
    if (!pending) return
    pendingProjectChangeRef.current = null
    if (pending.projectId === projectId) {
      projectSelectTriggerRef.current?.focus()
      return
    }
    setError(new ApiError(t("home.projectSwitchFailed")))
  }, [loadingModels, projectId, t])

  function chooseStarter(message: string) {
    setMessage(message)
    messageInputRef.current?.focus()
  }

  async function addProject() {
    setProjectSelectOpen(false)
    setAddingProject(true)
    setError(null)
    try {
      const project = await pickWorkspaceProject(mutationToken)
      if (project) {
        pendingProjectChangeRef.current = { projectId: project.id }
        startProjectTransition(() =>
          router.replace(`/new?projectId=${encodeURIComponent(project.id)}`)
        )
      }
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure
          : new ApiError(
              failure instanceof Error ? failure.message : String(failure)
            )
      )
    } finally {
      setAddingProject(false)
    }
  }

  function selectProject(value: string) {
    const nextProjectId = value === NO_PROJECT ? null : value
    if (nextProjectId === projectId) return
    setError(null)
    pendingProjectChangeRef.current = { projectId: nextProjectId }
    startProjectTransition(() =>
      router.replace(
        nextProjectId
          ? `/new?projectId=${encodeURIComponent(nextProjectId)}`
          : "/new"
      )
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    const submittedMessage = message
    const submittedImages = composerImages.images
    if (
      (!text && submittedImages.length === 0) ||
      submittingRef.current ||
      pendingProjectChangeRef.current !== null ||
      loadingModels
    ) {
      return
    }

    submittingRef.current = true
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
              message: text || t("home.imageOnlyPrompt"),
              images: promptImages(submittedImages),
              ...(model
                ? { model: { provider: model.provider, modelId: model.id } }
                : {}),
              ...(thinkingLevel ? { thinkingLevel } : {}),
            }),
          }
        )
      )

      setMessage(draftAfterAcceptedSend(messageRef.current, submittedMessage))
      composerImages.clearAcceptedImages(submittedImages)
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
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const modelUnavailable = error?.code === "ModelUnavailable"

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col px-4 py-6 md:min-h-svh md:px-8 md:py-8">
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <SparklesIcon className="size-7 text-primary" />
          <h1 className="max-w-3xl text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
            {selectedProject ? (
              <>
                {t("home.heading.projectBefore")}
                <span className="underline decoration-border underline-offset-8">
                  {selectedProject.name}
                </span>
                {t("home.heading.projectAfter")}
              </>
            ) : (
              t("home.heading.default")
            )}
          </h1>
        </div>

        <div className="grid w-full max-w-4xl grid-cols-2 gap-3 lg:grid-cols-4">
          {STARTERS.map(({ icon: Icon, labelKey, iconClassName }) => {
            const label = t(labelKey)
            return (
              <Button
                key={labelKey}
                type="button"
                variant="secondary"
                className="h-24 items-start justify-between rounded-2xl border bg-card p-4 text-left whitespace-normal shadow-sm shadow-foreground/5 hover:bg-accent sm:h-28 sm:flex-col"
                onClick={() => chooseStarter(label)}
              >
                <span
                  className={`flex size-9 items-center justify-center rounded-xl ${iconClassName}`}
                >
                  <Icon />
                </span>
                <span>{label}</span>
              </Button>
            )
          })}
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
              {modelUnavailable ? t("home.modelUnavailable") : error.message}
            </p>
            {modelUnavailable ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/models">{t("home.openSettings")}</Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <ConversationComposer
          value={message}
          onValueChange={setMessage}
          onSubmit={submit}
          placeholder={t("home.composer.placeholder")}
          ariaLabel={t("home.composer.ariaLabel")}
          submitting={submitting}
          sendDisabled={loadingModels || composerImages.loading}
          images={composerImages.images}
          imageError={composerImages.error}
          imagesSupported={model?.input.includes("image") ?? false}
          allowImageChangesWhileSubmitting
          onImagesAdd={composerImages.addImages}
          onImageRemove={composerImages.removeImage}
          onCycleThinkingLevel={
            model &&
            thinkingLevel &&
            model.availableThinkingLevels.length > 1 &&
            !loadingModels &&
            !submitting
              ? () =>
                  setModelSelection((current) => ({
                    ...current,
                    thinkingLevel: nextThinkingLevel(
                      thinkingLevel,
                      model.availableThinkingLevels
                    ),
                  }))
              : undefined
          }
          textareaRef={messageInputRef}
          className="shadow-lg shadow-foreground/5"
          commands={[
            {
              id: "goal",
              label: t("home.command.goal"),
              description: t("home.command.insideTask"),
              icon: TargetIcon,
              disabled: true,
              onSelect: noop,
            },
            {
              id: "compact",
              label: t("home.command.compact"),
              description: t("home.command.insideTask"),
              icon: Minimize2Icon,
              disabled: true,
              onSelect: noop,
            },
            {
              id: "reload",
              label: t("home.command.reload"),
              description: t("home.command.insideTask"),
              icon: RefreshCwIcon,
              disabled: true,
              onSelect: noop,
            },
          ]}
          actions={
            <>
              {submitting ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  {t("home.status.creatingTask")}
                </span>
              ) : loadingModels ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  {t("home.status.loadingModels")}
                </span>
              ) : composerImages.loading ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin" />
                  {t("home.status.readingImages")}
                </span>
              ) : null}
            </>
          }
          settings={
            <>
              <Select
                open={projectSelectOpen}
                onOpenChange={setProjectSelectOpen}
                value={projectId ?? NO_PROJECT}
                onValueChange={selectProject}
                disabled={submitting || addingProject || loadingModels}
              >
                <SelectTrigger
                  ref={projectSelectTriggerRef}
                  size="sm"
                  className="max-w-64"
                  aria-label={t("home.project.ariaLabel")}
                >
                  <FolderIcon />
                  <SelectValue>
                    {selectedProject?.name ?? t("home.project.standalone")}
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
                      disabled={addingProject}
                      onClick={() => void addProject()}
                    >
                      <PlusIcon />
                      {addingProject
                        ? t("home.project.choosing")
                        : t("home.project.add")}
                    </Button>
                  }
                >
                  <SelectGroup>
                    <SelectItem value={NO_PROJECT}>
                      {t("home.project.standalone")}
                    </SelectItem>
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
                  setError(null)
                  setModelSelection((current) => ({
                    ...current,
                    model: nextModel,
                    thinkingLevel: nextModel.defaultThinkingLevel,
                  }))
                }}
                disabled={loadingModels || submitting}
                settingsHref="/settings/models"
              />
              {model && thinkingLevel ? (
                <ComposerThinkingSelect
                  level={thinkingLevel}
                  levels={model.availableThinkingLevels}
                  onLevelChange={(level) =>
                    setModelSelection((current) => ({
                      ...current,
                      thinkingLevel: level,
                    }))
                  }
                  disabled={loadingModels || submitting}
                />
              ) : null}
            </>
          }
        />
      </div>
    </div>
  )
}

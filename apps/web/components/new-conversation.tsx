"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { useRouter } from "next/navigation"
import {
  BugIcon,
  CircleAlertIcon,
  GitPullRequestIcon,
  HammerIcon,
  LoaderCircleIcon,
  Minimize2Icon,
  RefreshCwIcon,
  SearchCodeIcon,
  TargetIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
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
  adjacentThinkingLevel,
  ComposerModelSelect,
  ComposerThinkingSelect,
  ConversationComposer,
  nextThinkingLevel,
} from "@/components/conversation-composer"
import { useSessionComposerDraftStore } from "@/components/session-composer-draft-context"
import { ApiError, responseJson } from "@/lib/api-response"
import { useI18n } from "@/components/i18n-provider"
import type { ComposerImage } from "@/lib/prompt-images"
import {
  draftAfterAcceptedSend,
  NEW_CONVERSATION_DRAFT_ID,
} from "@/lib/session-composer-draft-store"
import {
  createSingleFlight,
  isRecoverableRuntimeDraftLeaseError,
  sameRuntimeDraftRequest,
  type RuntimeDraftRequestIdentity,
} from "@/lib/runtime-draft-controller"

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

interface RuntimeDraftLease {
  draftId: string
  leaseId: string
  leaseToken: string
  projectId: string | null
  status: "starting" | "ready" | "busy" | "stopping" | "stopped" | "crashed"
  snapshot: unknown
}

interface ModelSelection {
  projectId: string | null
  settings: ModelSettings | null
  model: ModelSettingsModel | null
  thinkingLevel: ThinkingLevel | null
}

function modelKey(model: Pick<RuntimeModel, "provider" | "id">) {
  return `${model.provider}/${model.id}`
}

function enabledModels(settings: ModelSettings | null) {
  return (settings?.models ?? []).filter((model) => model.enabled)
}

function initialModel(settings: ModelSettings | null) {
  const models = enabledModels(settings)
  return (
    models.find(
      (model) =>
        settings?.defaultModel != null &&
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
  },
  {
    icon: HammerIcon,
    labelKey: "home.starter.build",
  },
  {
    icon: GitPullRequestIcon,
    labelKey: "home.starter.review",
  },
  {
    icon: BugIcon,
    labelKey: "home.starter.fix",
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
  initialModelSettings: ModelSettings | null
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
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [draftError, setDraftError] = useState<string | null>(() =>
    typeof globalThis.crypto?.randomUUID === "function"
      ? null
      : "The browser cannot create a runtime draft identity."
  )
  const [draftPreparing, setDraftPreparing] = useState(false)
  const [draftClaimed, setDraftClaimed] = useState(false)
  const [draftRevision, setDraftRevision] = useState(0)
  const draftGeneration = useMemo(
    () => ({
      projectId,
      settings: initialModelSettings,
      mutationToken,
      revision: draftRevision,
    }),
    [draftRevision, initialModelSettings, mutationToken, projectId]
  )
  const [draftBinding, setDraftBinding] = useState<{
    lease: RuntimeDraftLease
    generation: typeof draftGeneration
  } | null>(null)
  const draftLease = draftBinding?.lease ?? null
  const draftLeaseGeneration = draftBinding?.generation ?? null
  const mountedRef = useRef(false)
  const draftLeaseRef = useRef<RuntimeDraftLease | null>(null)
  const draftLeaseGenerationRef = useRef<typeof draftGeneration | null>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
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
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const generation = draftGeneration
    let cancelled = false
    let leaseToken: string | null = null
    draftLeaseRef.current = null
    draftLeaseGenerationRef.current = null
    queueMicrotask(() => {
      if (cancelled) return
      setDraftBinding(null)
      setDraftClaimed(false)
      setSubmitting(false)
      submittingRef.current = false
      setError(null)
      setDraftPreparing(Boolean(initialModelSettings))
      setDraftError(null)
    })

    if (!initialModelSettings) {
      queueMicrotask(() => {
        if (!cancelled) setDraftPreparing(false)
      })
      return
    }
    if (typeof globalThis.crypto?.randomUUID !== "function") {
      queueMicrotask(() => {
        if (cancelled) return
        setDraftPreparing(false)
        setDraftError("The browser cannot create a runtime draft identity.")
      })
      return
    }

    const draftModel = initialModel(initialModelSettings)
    const draftStorageKey = `pi-webui:new-draft:${projectId ?? "task"}`
    // Keep one draft ID per target in sessionStorage so revisiting /new
    // re-attaches to the warm draft runtime instead of spawning another.
    let draftId = (() => {
      try {
        const existing = sessionStorage.getItem(draftStorageKey)
        if (existing) return existing
        const fresh = globalThis.crypto.randomUUID()
        sessionStorage.setItem(draftStorageKey, fresh)
        return fresh
      } catch {
        return globalThis.crypto.randomUUID()
      }
    })()
    const leaseId = globalThis.crypto.randomUUID()

    const release = () => {
      if (!leaseToken) return
      const token = leaseToken
      leaseToken = null
      void fetch(`/api/v1/runtime-drafts/${encodeURIComponent(draftId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Pi-Web-Codex-Mutation-Token": mutationToken,
        },
        body: JSON.stringify({ leaseToken: token, leaseId }),
        keepalive: true,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Draft lease release failed (${response.status}).`)
          }
        })
        .catch((failure: unknown) => {
          console.error("Could not release the runtime draft lease:", failure)
        })
    }

    void (async () => {
      try {
        const requestDraft = async (id: string) =>
          responseJson<RuntimeDraftLease>(
            await fetch("/api/v1/runtime-drafts", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Pi-Web-Codex-Mutation-Token": mutationToken,
              },
              body: JSON.stringify({
                draftId: id,
                leaseId,
                projectId,
                ...(draftModel
                  ? {
                      model: {
                        provider: draftModel.provider,
                        modelId: draftModel.id,
                      },
                      thinkingLevel: draftModel.defaultThinkingLevel,
                    }
                  : {}),
              }),
            })
          )
        let prepared: RuntimeDraftLease
        try {
          prepared = await requestDraft(draftId)
        } catch (firstFailure) {
          // The remembered draft ID may point at a claimed/disposed runtime;
          // mint a fresh one and retry once before surfacing the error.
          try {
            sessionStorage.removeItem(draftStorageKey)
          } catch {
            // Persistence is best-effort.
          }
          draftId = globalThis.crypto.randomUUID()
          try {
            sessionStorage.setItem(draftStorageKey, draftId)
          } catch {
            // Persistence is best-effort.
          }
          try {
            prepared = await requestDraft(draftId)
          } catch {
            throw firstFailure
          }
        }
        leaseToken = prepared.leaseToken
        if (cancelled || generation !== draftGeneration) {
          release()
          return
        }
        if (prepared.projectId !== projectId) {
          release()
          setDraftPreparing(false)
          setDraftError(
            "The runtime draft target changed while it was starting."
          )
          return
        }
        const nextLease = { ...prepared, leaseId }
        draftLeaseRef.current = nextLease
        draftLeaseGenerationRef.current = generation
        setDraftBinding({ lease: nextLease, generation })
        setDraftPreparing(false)
      } catch (failure) {
        if (cancelled || generation !== draftGeneration) return
        setDraftPreparing(false)
        setDraftError(
          failure instanceof Error ? failure.message : String(failure)
        )
      }
    })()

    return () => {
      cancelled = true
      release()
      if (draftLeaseGenerationRef.current === generation) {
        draftLeaseRef.current = null
        draftLeaseGenerationRef.current = null
      }
    }
  }, [draftGeneration, initialModelSettings, mutationToken, projectId])

  useEffect(() => {
    if (!draftLease || draftClaimed) return
    const generation = draftLeaseGenerationRef.current
    if (
      generation === null ||
      generation !== draftGeneration ||
      draftLease.projectId !== projectId
    ) {
      return
    }
    const lease = draftLease
    const identity: RuntimeDraftRequestIdentity = {
      generation,
      projectId: lease.projectId,
      draftId: lease.draftId,
      leaseId: lease.leaseId,
    }
    let disposed = false
    let recoveryRequested = false
    const flight = createSingleFlight<void>()
    const isCurrent = () => {
      const current = draftLeaseRef.current
      return (
        !disposed &&
        sameRuntimeDraftRequest(identity, {
          generation: draftGeneration,
          projectId,
          draftId: current?.draftId ?? "",
          leaseId: current?.leaseId ?? "",
        })
      )
    }
    const recoverLease = () => {
      if (!isCurrent() || recoveryRequested) return
      recoveryRequested = true
      draftLeaseRef.current = null
      draftLeaseGenerationRef.current = null
      setDraftBinding(null)
      setDraftClaimed(false)
      setDraftError(null)
      setDraftPreparing(true)
      setDraftRevision((value) => value + 1)
    }
    const refresh = () =>
      flight.run(async () => {
        if (!isCurrent()) return
        try {
          const refreshed = await responseJson<RuntimeDraftLease>(
            await fetch(
              `/api/v1/runtime-drafts/${encodeURIComponent(lease.draftId)}`,
              {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  "X-Pi-Web-Codex-Mutation-Token": mutationToken,
                },
                body: JSON.stringify({
                  leaseToken: lease.leaseToken,
                  leaseId: lease.leaseId,
                }),
              }
            )
          )
          if (!isCurrent()) return
          if (refreshed.projectId !== projectId) {
            setDraftError(
              "The runtime draft target changed while it was active."
            )
            return
          }
          const nextLease = { ...refreshed, leaseId: lease.leaseId }
          draftLeaseRef.current = nextLease
          setDraftBinding({ lease: nextLease, generation })
          if (refreshed.status === "ready" || refreshed.status === "busy") {
            setDraftError(null)
          } else {
            setDraftError(t("session.runtime.inactive"))
          }
        } catch (failure) {
          if (!isCurrent()) return
          if (isRecoverableRuntimeDraftLeaseError(failure)) {
            recoverLease()
            return
          }
          setDraftError(
            failure instanceof Error ? failure.message : String(failure)
          )
        }
      })
    const timer = window.setInterval(() => void refresh(), 60_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", refreshWhenVisible)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", refreshWhenVisible)
    }
  }, [draftClaimed, draftGeneration, draftLease, mutationToken, projectId, t])

  useEffect(() => {
    if (
      window.matchMedia(
        "(min-width: 768px) and (hover: hover) and (pointer: fine)"
      ).matches
    ) {
      messageInputRef.current?.focus()
    }
  }, [])

  function chooseStarter(message: string) {
    setMessage(message)
    messageInputRef.current?.focus()
  }

  function changeThinkingLevel(direction: -1 | 1) {
    if (!model || !thinkingLevel) return
    setModelSelection((current) => ({
      ...current,
      thinkingLevel: adjacentThinkingLevel(
        thinkingLevel,
        model.availableThinkingLevels,
        direction,
        t
      ),
    }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = message.trim()
    const submittedMessage = message
    const submittedImages = composerImages.images
    const lease = draftLeaseRef.current
    const leaseGeneration = draftLeaseGeneration
    const generation = draftGeneration
    const identity: RuntimeDraftRequestIdentity | null =
      lease && leaseGeneration !== null
        ? {
            generation: leaseGeneration,
            projectId: lease.projectId,
            draftId: lease.draftId,
            leaseId: lease.leaseId,
          }
        : null
    const isCurrentClaim = () => {
      if (!identity || !lease) return false
      return (
        mountedRef.current &&
        sameRuntimeDraftRequest(identity, {
          generation,
          projectId,
          draftId: draftLeaseRef.current?.draftId ?? "",
          leaseId: draftLeaseRef.current?.leaseId ?? "",
        }) &&
        lease.projectId === projectId &&
        leaseGeneration === generation
      )
    }
    if (
      (!text && submittedImages.length === 0) ||
      submittingRef.current ||
      !initialModelSettings ||
      !lease ||
      lease.projectId !== projectId ||
      leaseGeneration !== generation ||
      draftError !== null ||
      draftPreparing ||
      lease.status !== "ready"
    ) {
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    try {
      const created = await responseJson<CreatedSession>(
        await fetch(
          `/api/v1/runtime-drafts/${encodeURIComponent(lease.draftId)}/claim`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
            body: JSON.stringify({
              message: text || t("home.imageOnlyPrompt"),
              images: promptImages(submittedImages),
              leaseToken: lease.leaseToken,
              leaseId: lease.leaseId,
              ...(model
                ? { model: { provider: model.provider, modelId: model.id } }
                : {}),
              ...(thinkingLevel ? { thinkingLevel } : {}),
            }),
          }
        )
      )

      if (!isCurrentClaim()) return
      if (created.projectId !== projectId) {
        throw new ApiError(
          "The runtime draft target changed while sending.",
          "RuntimeDraftTargetMismatch"
        )
      }
      setDraftClaimed(true)
      setMessage(draftAfterAcceptedSend(messageRef.current, submittedMessage))
      composerImages.clearAcceptedImages(submittedImages)
      router.push(
        created.projectId === null
          ? `/tasks/${created.sessionId}`
          : `/projects/${created.projectId}/sessions/${created.sessionId}`
      )
      router.refresh()
    } catch (failure) {
      if (!isCurrentClaim()) return
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
  const draftRuntimeActive =
    draftError === null &&
    !draftPreparing &&
    draftLease?.projectId === projectId &&
    draftLeaseGeneration === draftGeneration &&
    (draftLease.status === "ready" || draftLease.status === "busy")

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col px-4 py-6 md:min-h-svh md:px-8 md:py-8">
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 py-8 text-center">
        <div className="flex flex-col items-center">
          <h1 className="max-w-3xl text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
            {selectedProject ? (
              <>
                {t("home.heading.projectBefore")}
                <span className="[overflow-wrap:anywhere] underline decoration-border underline-offset-8">
                  {selectedProject.name}
                </span>
                {t("home.heading.projectAfter")}
              </>
            ) : (
              t("home.heading.default")
            )}
          </h1>
        </div>

        <div className="grid w-full max-w-4xl grid-cols-2 gap-2 lg:grid-cols-4">
          {STARTERS.map(({ icon: Icon, labelKey }) => {
            const label = t(labelKey)
            return (
              <Button
                key={labelKey}
                type="button"
                variant="outline"
                className="h-20 items-start justify-between rounded-xl p-3 text-left whitespace-normal shadow-none sm:h-24 sm:flex-col"
                onClick={() => chooseStarter(label)}
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon />
                </span>
                <span>{label}</span>
              </Button>
            )
          })}
        </div>
      </section>

      <div className="mx-auto flex w-full max-w-[52rem] min-w-0 flex-col gap-3">
        {error || draftError ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 break-words">
              {draftError ??
                (modelUnavailable
                  ? t("home.modelUnavailable")
                  : error?.message)}
            </p>
            {modelUnavailable && !draftError ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/models">{t("home.openSettings")}</Link>
              </Button>
            ) : null}
            {draftError ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraftError(null)
                  setDraftPreparing(true)
                  draftLeaseRef.current = null
                  draftLeaseGenerationRef.current = null
                  setDraftBinding(null)
                  setDraftClaimed(false)
                  submittingRef.current = false
                  setSubmitting(false)
                  setDraftRevision((value) => value + 1)
                }}
              >
                {t("session.runtime.restart")}
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
          sendDisabled={
            composerImages.loading ||
            !initialModelSettings ||
            draftPreparing ||
            !draftRuntimeActive ||
            draftError !== null
          }
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
            !submitting
              ? () =>
                  setModelSelection((current) => ({
                    ...current,
                    thinkingLevel: nextThinkingLevel(
                      thinkingLevel,
                      model.availableThinkingLevels,
                      t
                    ),
                  }))
              : undefined
          }
          onDecreaseThinkingLevel={
            model &&
            thinkingLevel &&
            model.availableThinkingLevels.length > 1 &&
            !submitting
              ? () => changeThinkingLevel(-1)
              : undefined
          }
          onIncreaseThinkingLevel={
            model &&
            thinkingLevel &&
            model.availableThinkingLevels.length > 1 &&
            !submitting
              ? () => changeThinkingLevel(1)
              : undefined
          }
          textareaRef={messageInputRef}
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
          sessionControls={{
            goal: { disabled: true },
            runtime: {
              active: draftRuntimeActive,
              label: t(
                draftRuntimeActive
                  ? "session.runtime.active"
                  : "session.runtime.inactive"
              ),
            },
            compact: { disabled: true },
          }}
          actions={
            <>
              {submitting ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" />
                  {t("home.status.creatingTask")}
                </span>
              ) : draftPreparing ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" />
                  {t("session.runtime.inactive")}
                </span>
              ) : composerImages.loading ? (
                <span
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <LoaderCircleIcon className="size-3 animate-spin motion-reduce:animate-none" />
                  {t("home.status.readingImages")}
                </span>
              ) : null}
            </>
          }
          settings={
            <>
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
                disabled={submitting}
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
                  disabled={submitting}
                />
              ) : null}
            </>
          }
        />
      </div>
    </div>
  )
}

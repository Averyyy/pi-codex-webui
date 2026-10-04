"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"
import {
  agentSettingsSnapshotSchema,
  type AgentSettings,
  type AgentSettingsSnapshot,
} from "@workspace/runtime-protocol"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldGroup,
  FieldError,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"

import { useI18n } from "@/components/i18n-provider"
import { validatedResponseJson } from "@/lib/api-response"
import {
  agentSettingsPatch,
  codemodeIsEnabled,
  codemodeToolSelection,
  globalAgentSettings,
} from "@/lib/agent-settings-form"

export function AgentSettingsForm({
  mutationToken,
}: {
  mutationToken: string
}) {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<AgentSettingsSnapshot | null>(null)
  const [draft, setDraft] = useState<AgentSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, startSaving] = useTransition()
  const [overrides, setOverrides] = useState("{}")
  const [thinkingLevels, setThinkingLevels] = useState("{}")

  const apply = useCallback((next: AgentSettingsSnapshot) => {
    const values = globalAgentSettings(next)
    setSnapshot(next)
    setDraft(values)
    setOverrides(
      JSON.stringify(values.compaction?.modelOverrides ?? {}, null, 2)
    )
    setThinkingLevels(JSON.stringify(values.modelThinkingLevels ?? {}, null, 2))
  }, [])

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const result = await validatedResponseJson(
          await fetch("/api/v1/agent-settings", { signal }),
          (value) => agentSettingsSnapshotSchema.parse(value),
          t("settings.agent.loadFailed")
        )
        apply(result)
      } catch (error) {
        if (signal?.aborted) return
        setError(
          error instanceof Error
            ? error.message
            : t("settings.agent.loadFailed")
        )
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [apply, t]
  )

  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(() => load(controller.signal))
    return () => controller.abort()
  }, [load])

  function reload() {
    setLoading(true)
    setError(null)
    void load()
  }

  if (loading)
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircleIcon className="size-4 animate-spin" />
        {t("settings.agent.loading")}
      </div>
    )
  if (!snapshot || !draft)
    return (
      <div className="grid gap-3">
        <FieldError>{error}</FieldError>
        <Button variant="outline" onClick={reload}>
          {t("session.project.retry")}
        </Button>
      </div>
    )

  const saved = globalAgentSettings(snapshot)
  const dirty =
    Object.keys(agentSettingsPatch(saved, draft)).length > 0 ||
    overrides !==
      JSON.stringify(saved.compaction?.modelOverrides ?? {}, null, 2) ||
    thinkingLevels !== JSON.stringify(saved.modelThinkingLevels ?? {}, null, 2)
  const codemodeEnabled = codemodeIsEnabled(draft.defaultTools ?? [])
  const update = (patch: AgentSettings) => {
    setDraft({ ...draft, ...patch })
    setError(null)
  }

  function save() {
    startSaving(async () => {
      try {
        const next = {
          ...draft!,
          modelThinkingLevels: JSON.parse(thinkingLevels),
          compaction: {
            ...draft!.compaction,
            modelOverrides: JSON.parse(overrides),
          },
        }
        const response = await fetch("/api/v1/agent-settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({
            settings: agentSettingsPatch(saved, next),
            expected: snapshot!.global,
          }),
        })
        apply(
          await validatedResponseJson(
            response,
            (value) => agentSettingsSnapshotSchema.parse(value),
            t("settings.common.saveFailed")
          )
        )
        setError(null)
        toast.success(t("settings.agent.saved"))
      } catch (error) {
        setError(
          error instanceof SyntaxError
            ? t("settings.agent.invalidJson")
            : error instanceof Error
              ? error.message
              : t("settings.common.saveFailed")
        )
      }
    })
  }

  const number = (
    id: string,
    label: string,
    value: number | undefined,
    onChange: (value: number) => void,
    description?: string
  ) => (
    <Field orientation="responsive">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
      <Input
        id={id}
        type="number"
        required
        min={0}
        step={1}
        className="w-full sm:w-44"
        value={Number.isNaN(value) ? "" : (value ?? "")}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
    </Field>
  )
  const toggle = (
    id: string,
    label: string,
    value: boolean | undefined,
    onChange: (value: boolean) => void,
    description?: string
  ) => (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </Field>
  )
  const select = (
    id: string,
    label: string,
    value: string | undefined,
    choices: readonly string[],
    onChange: (value: string) => void,
    description?: string
  ) => (
    <Field orientation="responsive">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice} value={choice}>
              {t(`settings.agent.choice.${choice}` as Parameters<typeof t>[0])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )

  return (
    <form
      className="grid gap-5"
      inert={pending}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <p className="text-sm text-muted-foreground">
        {t("settings.agent.scope")}
      </p>
      {snapshot.projectTrusted && Object.keys(snapshot.project).length > 0 ? (
        <p className="rounded-lg border p-3 text-sm">
          {t("settings.agent.projectOverrides")}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.agent.tools")}</CardTitle>
          <CardDescription>
            {t("settings.agent.toolsDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {toggle(
              "codemode-enabled",
              t("settings.agent.codemode"),
              codemodeEnabled,
              (enabled) =>
                update({
                  defaultTools: codemodeToolSelection(
                    draft.defaultTools,
                    enabled
                  ),
                }),
              t("settings.agent.codemodeDescription")
            )}
            {codemodeEnabled ? (
              <>
                {select(
                  "codemode-mode",
                  t("settings.agent.codemodeMode"),
                  draft.codemode?.mode,
                  ["on", "only"],
                  (mode) =>
                    update({
                      codemode: {
                        ...draft.codemode,
                        mode: mode as "on" | "only",
                      },
                    }),
                  t("settings.agent.codemodeModeDescription")
                )}
                {number(
                  "codemode-budget",
                  t("settings.agent.inlineBudget"),
                  draft.codemode?.inlineBudget,
                  (inlineBudget) =>
                    update({ codemode: { ...draft.codemode, inlineBudget } }),
                  t("settings.agent.inlineBudgetDescription")
                )}
              </>
            ) : null}
            <Field>
              <FieldLabel htmlFor="default-tools">
                {t("settings.agent.defaultTools")}
              </FieldLabel>
              <FieldDescription>
                {t("settings.agent.defaultToolsDescription")}
              </FieldDescription>
              <Input
                id="default-tools"
                value={(draft.defaultTools ?? []).join(", ")}
                onChange={(event) =>
                  update({
                    defaultTools: event.target.value
                      .split(",")
                      .map((name) => name.trim())
                      .filter(Boolean),
                  })
                }
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.agent.modelContext")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {select(
              "default-thinking",
              t("settings.agent.defaultThinking"),
              draft.defaultThinkingLevel,
              ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
              (defaultThinkingLevel) =>
                update({
                  defaultThinkingLevel:
                    defaultThinkingLevel as AgentSettings["defaultThinkingLevel"],
                })
            )}
            {select(
              "cache-warming",
              t("settings.agent.cacheWarming"),
              draft.cacheWarming,
              ["off", "streaming", "idle"],
              (cacheWarming) =>
                update({
                  cacheWarming: cacheWarming as AgentSettings["cacheWarming"],
                }),
              t("settings.agent.cacheWarmingDescription")
            )}
            {toggle(
              "compaction-enabled",
              t("settings.agent.compaction"),
              draft.compaction?.enabled,
              (enabled) =>
                update({ compaction: { ...draft.compaction, enabled } })
            )}
            {number(
              "compaction-reserve",
              t("settings.agent.reserveTokens"),
              draft.compaction?.reserveTokens,
              (reserveTokens) =>
                update({ compaction: { ...draft.compaction, reserveTokens } })
            )}
            {number(
              "compaction-recent",
              t("settings.agent.keepRecentTokens"),
              draft.compaction?.keepRecentTokens,
              (keepRecentTokens) =>
                update({
                  compaction: { ...draft.compaction, keepRecentTokens },
                })
            )}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {t("settings.agent.perModel")}
              </summary>
              <div className="mt-4 grid gap-4">
                <Field>
                  <FieldLabel htmlFor="model-thinking-levels">
                    {t("settings.agent.modelThinkingLevels")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("settings.agent.modelThinkingLevelsDescription")}
                  </FieldDescription>
                  <Textarea
                    id="model-thinking-levels"
                    className="font-mono text-xs"
                    rows={4}
                    value={thinkingLevels}
                    onChange={(event) => {
                      setThinkingLevels(event.target.value)
                      setError(null)
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="compaction-model-overrides">
                    {t("settings.agent.compactionOverrides")}
                  </FieldLabel>
                  <FieldDescription>
                    {t("settings.agent.compactionOverridesDescription")}
                  </FieldDescription>
                  <Textarea
                    id="compaction-model-overrides"
                    className="font-mono text-xs"
                    rows={5}
                    value={overrides}
                    onChange={(event) => {
                      setOverrides(event.target.value)
                      setError(null)
                    }}
                  />
                </Field>
              </div>
            </details>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.agent.network")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {select(
              "provider-transport",
              t("settings.agent.transport"),
              draft.transport,
              ["auto", "sse", "websocket", "websocket-cached"],
              (transport) =>
                update({ transport: transport as AgentSettings["transport"] }),
              t("settings.agent.transportDescription")
            )}
            {number(
              "http-idle-timeout",
              t("settings.agent.httpTimeout"),
              draft.httpIdleTimeoutMs,
              (httpIdleTimeoutMs) => update({ httpIdleTimeoutMs }),
              t("settings.agent.timeoutDescription")
            )}
            {number(
              "websocket-connect-timeout",
              t("settings.agent.websocketTimeout"),
              draft.websocketConnectTimeoutMs,
              (websocketConnectTimeoutMs) =>
                update({ websocketConnectTimeoutMs }),
              t("settings.agent.timeoutDescription")
            )}
            {toggle(
              "retry-enabled",
              t("settings.agent.retryEnabled"),
              draft.retry?.enabled,
              (enabled) => update({ retry: { ...draft.retry, enabled } })
            )}
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {t("settings.agent.retryOptions")}
              </summary>
              <FieldGroup className="mt-4">
                {number(
                  "retry-count",
                  t("settings.agent.retryCount"),
                  draft.retry?.maxRetries,
                  (maxRetries) =>
                    update({ retry: { ...draft.retry, maxRetries } })
                )}
                {number(
                  "retry-delay",
                  t("settings.agent.retryDelay"),
                  draft.retry?.baseDelayMs,
                  (baseDelayMs) =>
                    update({ retry: { ...draft.retry, baseDelayMs } })
                )}
                {number(
                  "retry-max-delay",
                  t("settings.agent.retryMaxDelay"),
                  draft.retry?.maxAgentDelayMs,
                  (maxAgentDelayMs) =>
                    update({ retry: { ...draft.retry, maxAgentDelayMs } })
                )}
                {number(
                  "provider-retry-count",
                  t("settings.agent.providerRetryCount"),
                  draft.retry?.provider?.maxRetries,
                  (maxRetries) =>
                    update({
                      retry: {
                        ...draft.retry,
                        provider: { ...draft.retry?.provider, maxRetries },
                      },
                    }),
                  t("settings.agent.providerRetryDescription")
                )}
                {number(
                  "provider-timeout",
                  t("settings.agent.providerTimeout"),
                  draft.retry?.provider?.timeoutMs,
                  (timeoutMs) =>
                    update({
                      retry: {
                        ...draft.retry,
                        provider: { ...draft.retry?.provider, timeoutMs },
                      },
                    })
                )}
                {number(
                  "provider-max-delay",
                  t("settings.agent.providerMaxDelay"),
                  draft.retry?.provider?.maxRetryDelayMs,
                  (maxRetryDelayMs) =>
                    update({
                      retry: {
                        ...draft.retry,
                        provider: { ...draft.retry?.provider, maxRetryDelayMs },
                      },
                    }),
                  t("settings.agent.timeoutDescription")
                )}
              </FieldGroup>
            </details>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.agent.interaction")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {select(
              "steering-mode",
              t("settings.agent.steeringMode"),
              draft.steeringMode,
              ["one-at-a-time", "all"],
              (steeringMode) =>
                update({
                  steeringMode: steeringMode as AgentSettings["steeringMode"],
                })
            )}
            {select(
              "followup-mode",
              t("settings.agent.followUpMode"),
              draft.followUpMode,
              ["one-at-a-time", "all"],
              (followUpMode) =>
                update({
                  followUpMode: followUpMode as AgentSettings["followUpMode"],
                })
            )}
            {toggle(
              "image-auto-resize",
              t("settings.agent.imageResize"),
              draft.images?.autoResize,
              (autoResize) =>
                update({ images: { ...draft.images, autoResize } }),
              t("settings.agent.imageResizeDescription")
            )}
            {toggle(
              "block-images",
              t("settings.agent.blockImages"),
              draft.images?.blockImages,
              (blockImages) =>
                update({ images: { ...draft.images, blockImages } })
            )}
          </FieldGroup>
        </CardContent>
      </Card>
      {error ? (
        <FieldError role="alert" className="rounded-lg bg-destructive/5 p-3">
          {error}
        </FieldError>
      ) : null}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-3">
        <p className="text-sm text-muted-foreground">
          {t("settings.agent.applies")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={reload}>
            {t("settings.agent.reload")}
          </Button>
          <Button type="submit" disabled={!dirty || pending}>
            {pending ? t("settings.common.saving") : t("settings.common.save")}
          </Button>
        </div>
      </div>
    </form>
  )
}

"use client"

import {
  memo,
  useDeferredValue,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import {
  ChevronDownIcon,
  ListChecksIcon,
  ListXIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { CustomProviderForm } from "@/components/custom-provider-form"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useI18n } from "@/components/i18n-provider"
import { ApiError, responseJson } from "@/lib/api-response"
import { refreshModelAndExtensionCatalogs } from "@/lib/catalog-refresh-client"
import { useModelCatalogStore } from "@/components/model-catalog-provider"
import type { Translator } from "@/lib/i18n"
import { nextModelProviderFocusTarget } from "@/lib/model-settings-focus"
import { isModelProviderVisibleByDefault } from "@/lib/model-settings-display"

function modelKey(model: Pick<ModelSettingsModel, "provider" | "id">) {
  return `${model.provider}/${model.id}`
}

function query(sessionId: string | null) {
  return sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""
}

function authStatusLabel(
  status: ModelSettingsProvider["authStatus"],
  t: Translator
) {
  return t(`settings.models.auth.status.${status}`)
}

function authKindLabel(kind: ModelSettingsProvider["authKind"], t: Translator) {
  return t(`settings.models.auth.kind.${kind}`)
}

function providerDescription(provider: ModelSettingsProvider, t: Translator) {
  if (provider.modelCount > 0) {
    return t("settings.models.availableModels", { count: provider.modelCount })
  }
  if (provider.customModels.length > 0) {
    return t("settings.models.modelsWithoutAuth", {
      count: provider.customModels.length,
    })
  }
  return t("settings.models.noAvailableModels")
}

const ModelSearchCard = memo(function ModelSearchCard({
  t,
  total,
  visible,
  onSearchChange,
}: {
  t: Translator
  total: number
  visible: number
  onSearchChange: (value: string) => void
}) {
  const [value, setValue] = useState("")
  const deferredValue = useDeferredValue(value)

  useEffect(() => {
    onSearchChange(deferredValue.trim().toLocaleLowerCase())
  }, [deferredValue, onSearchChange])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="model-search" className="sr-only">
              {t("settings.models.searchLabel")}
            </FieldLabel>
            <Input
              id="model-search"
              type="search"
              value={value}
              autoComplete="off"
              placeholder={t("settings.models.searchPlaceholder")}
              onChange={(event) => setValue(event.target.value)}
              aria-busy={value !== deferredValue}
            />
            {deferredValue.trim() ? (
              <FieldDescription aria-live="polite">
                {t("settings.models.filteredSummary", { visible, total })}
              </FieldDescription>
            ) : null}
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
})

function operationError(failure: unknown, t: Translator) {
  if (failure instanceof ApiError && failure.code === "InvalidCustomProvider") {
    return t("settings.models.invalidProvider")
  }
  if (failure instanceof ApiError && failure.code === "ModelScopeConflict") {
    return t("settings.models.conflict")
  }
  return failure instanceof Error ? failure.message : String(failure)
}

interface ModelSettingsProps {
  initial: ModelSettings
  mutationToken: string
  sessionId: string | null
  extensionProjectId: string | null
}

export function ModelSettings(props: ModelSettingsProps) {
  const { t } = useI18n()
  const catalogStore = useModelCatalogStore()
  const catalogTarget = useMemo(
    () =>
      props.sessionId
        ? { sessionId: props.sessionId }
        : { defaultTarget: true },
    [props.sessionId]
  )
  const subscribe = useCallback(
    (listener: () => void) =>
      catalogStore.subscribe(catalogTarget, "all", listener),
    [catalogStore, catalogTarget]
  )
  const getSnapshot = useCallback(
    () => catalogStore.getState(catalogTarget, "all").snapshot,
    [catalogStore, catalogTarget]
  )
  const settings = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => props.initial
  )
  if (!settings) {
    return (
      <Card aria-busy="true">
        <CardContent className="grid min-h-32 gap-3 py-6">
          <p role="status" className="text-sm text-muted-foreground">
            {t("home.status.loadingModels")}
          </p>
        </CardContent>
      </Card>
    )
  }
  return <ModelSettingsEditor {...props} initial={settings} />
}

function ModelSettingsEditor({
  initial,
  mutationToken,
  sessionId,
  extensionProjectId,
}: ModelSettingsProps) {
  const { t } = useI18n()
  const catalogStore = useModelCatalogStore()
  const catalogTarget = useMemo(
    () => (sessionId ? { sessionId } : { defaultTarget: true }),
    [sessionId]
  )
  const settings = initial
  const [working, setWorking] = useState<string | null>(null)
  const workingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement | null>(null)
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(
    () => new Set()
  )
  const [providerDialogOpen, setProviderDialogOpen] = useState(false)
  const providerDialogTriggerRef = useRef<HTMLButtonElement | null>(null)
  const addProviderButtonRef = useRef<HTMLButtonElement | null>(null)
  const providerSummaryRefs = useRef(new Map<string, HTMLElement>())
  const focusAfterProviderRemovalRef = useRef<string | null | undefined>(
    undefined
  )
  const [editingProvider, setEditingProvider] =
    useState<ModelSettingsProvider | null>(null)
  const [pendingProviderDelete, setPendingProviderDelete] = useState<{
    provider: string
    confirmKey:
      | "settings.models.deleteCustomProvider"
      | "settings.models.deleteProviderAuth"
  } | null>(null)
  const [modelSearch, setModelSearch] = useState("")
  const [showProvidersNeedingSetup, setShowProvidersNeedingSetup] =
    useState(false)
  const handleModelSearchChange = useCallback((value: string) => {
    setModelSearch(value)
  }, [])

  useEffect(() => {
    if (!error || working !== null || providerDialogOpen) return
    const frame = requestAnimationFrame(() => errorRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [error, providerDialogOpen, working])

  useLayoutEffect(() => {
    const provider = focusAfterProviderRemovalRef.current
    if (provider === undefined) return
    focusAfterProviderRemovalRef.current = undefined
    const target = provider ? providerSummaryRefs.current.get(provider) : null
    const focusTarget = target ?? addProviderButtonRef.current
    focusTarget?.focus()
  }, [settings.providers])

  async function readSettings(response: Response) {
    const fallback = t("settings.models.operationFailed")
    const parsed = modelSettingsSchema.safeParse(
      await responseJson<ModelSettings>(response, fallback)
    )
    if (!parsed.success) {
      throw new Error(fallback)
    }
    return parsed.data
  }

  function publishMutationResult(token: number, next: ModelSettings) {
    if (catalogStore.publishMutation(catalogTarget, "all", token, next)) {
      return true
    }
    setError(t("settings.models.conflict"))
    return false
  }

  function beginWorking(key: string) {
    if (workingRef.current) return false
    workingRef.current = true
    setWorking(key)
    return true
  }

  function finishWorking() {
    workingRef.current = false
    setWorking(null)
  }

  async function setEnabledModels(key: string, enabledModelIds: string[]) {
    const expectedEnabledModelIds = settings.models
      .filter((entry) => entry.enabled)
      .map(modelKey)

    if (!beginWorking(key)) return
    const operationToken = catalogStore.beginMutation(catalogTarget, "all")
    setError(null)
    try {
      const next = await readSettings(
        await fetch(`/api/v1/model-settings${query(sessionId)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({
            enabledModelIds,
            expectedEnabledModelIds,
          }),
        })
      )
      publishMutationResult(operationToken, next)
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === "ModelScopeConflict"
      ) {
        catalogStore.finishMutation(catalogTarget, "all", operationToken)
        try {
          await catalogStore.load(catalogTarget, "all", { force: true })
        } catch (refreshFailure) {
          setError(operationError(refreshFailure, t))
          return
        }
      }
      setError(operationError(failure, t))
    } finally {
      catalogStore.finishMutation(catalogTarget, "all", operationToken)
      finishWorking()
    }
  }

  async function setModelEnabled(model: ModelSettingsModel, enabled: boolean) {
    const enabledIds = new Set(
      settings.models.filter((entry) => entry.enabled).map(modelKey)
    )
    const key = modelKey(model)
    if (enabled) enabledIds.add(key)
    else enabledIds.delete(key)
    await setEnabledModels(key, [...enabledIds])
  }

  async function setProviderModelsEnabled(
    provider: string,
    providerModels: ModelSettingsModel[],
    enabled: boolean
  ) {
    const enabledIds = new Set(
      settings.models.filter((entry) => entry.enabled).map(modelKey)
    )
    for (const model of providerModels) {
      const key = modelKey(model)
      if (enabled) enabledIds.add(key)
      else enabledIds.delete(key)
    }
    await setEnabledModels(
      `provider-scope:${provider}:${enabled ? "enable" : "disable"}`,
      [...enabledIds]
    )
  }

  async function refreshSettings() {
    if (!beginWorking("refresh")) return
    setError(null)
    try {
      const result = await refreshModelAndExtensionCatalogs(
        catalogStore,
        {
          models: catalogTarget,
          extensionProjectId,
          sessionId: sessionId ?? undefined,
        },
        mutationToken
      )
      const errors = [
        ...result.modelRefreshErrors,
        ...result.extensionRefreshErrors,
      ]
      if (errors.length) toast.error(errors.join("; "))
      else {
        toast.success(t("settings.models.refreshSuccess"))
      }
    } catch (failure) {
      toast.error(operationError(failure, t))
    } finally {
      finishWorking()
    }
  }

  async function saveProvider(input: ModelSettingsProviderInput) {
    const provider = editingProvider?.provider ?? input.provider
    if (!beginWorking(`provider-save:${provider}`)) return
    const operationToken = catalogStore.beginMutation(catalogTarget, "all")
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
      if (publishMutationResult(operationToken, next))
        setProviderDialogOpen(false)
    } catch (failure) {
      setError(operationError(failure, t))
    } finally {
      catalogStore.finishMutation(catalogTarget, "all", operationToken)
      finishWorking()
    }
  }

  async function removeProvider(provider: string) {
    const nextFocusTarget = nextModelProviderFocusTarget(
      settings.providers.map((entry) => entry.provider),
      provider
    )
    if (!beginWorking(provider)) return
    const operationToken = catalogStore.beginMutation(catalogTarget, "all")
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
      if (!publishMutationResult(operationToken, next)) return
      focusAfterProviderRemovalRef.current = next.providers.some(
        (entry) => entry.provider === provider
      )
        ? provider
        : nextFocusTarget
    } catch (failure) {
      setError(operationError(failure, t))
    } finally {
      catalogStore.finishMutation(catalogTarget, "all", operationToken)
      finishWorking()
    }
  }

  function requestRemoveProvider(provider: string) {
    const providerView = settings.providers.find(
      (entry) => entry.provider === provider
    )
    setPendingProviderDelete({
      provider,
      confirmKey: providerView?.custom
        ? "settings.models.deleteCustomProvider"
        : "settings.models.deleteProviderAuth",
    })
  }

  async function confirmRemoveProvider() {
    if (!pendingProviderDelete) return
    const { provider } = pendingProviderDelete
    setPendingProviderDelete(null)
    await removeProvider(provider)
  }

  function openAddProvider(trigger: HTMLButtonElement) {
    providerDialogTriggerRef.current = trigger
    setEditingProvider(null)
    setError(null)
    setProviderDialogOpen(true)
  }

  function openEditProvider(
    provider: ModelSettingsProvider,
    trigger: HTMLButtonElement
  ) {
    providerDialogTriggerRef.current = trigger
    setEditingProvider(provider)
    setError(null)
    setProviderDialogOpen(true)
  }

  function setProviderDialog(open: boolean) {
    setProviderDialogOpen(open)
    if (!open) setError(null)
  }

  const enabledCount = useMemo(
    () =>
      settings.models.reduce(
        (count, model) => count + Number(model.enabled),
        0
      ),
    [settings.models]
  )
  const hasScope = Boolean(settings.enabledModels?.length)
  const normalizedSearch = modelSearch
  const providerRows = useMemo(() => {
    const modelsByProvider = new Map<string, ModelSettingsModel[]>()
    for (const model of settings.models) {
      const models = modelsByProvider.get(model.provider)
      if (models) models.push(model)
      else modelsByProvider.set(model.provider, [model])
    }
    return settings.providers.map((provider) => {
      const models = modelsByProvider.get(provider.provider) ?? []
      return {
        provider,
        allModels: models,
        enabledCount: models.reduce(
          (count, model) => count + Number(model.enabled),
          0
        ),
      }
    })
  }, [settings.models, settings.providers])
  const hiddenProviderCount = providerRows.reduce(
    (count, row) =>
      count + Number(!isModelProviderVisibleByDefault(row.provider)),
    0
  )
  const visibleProviders = useMemo(
    () =>
      providerRows.flatMap(({ provider, allModels, enabledCount }) => {
        if (
          !normalizedSearch &&
          !showProvidersNeedingSetup &&
          !isModelProviderVisibleByDefault(provider)
        ) {
          return []
        }
        const providerMatches = [provider.provider, provider.name].some(
          (value) => value?.toLocaleLowerCase().includes(normalizedSearch)
        )
        const models =
          !normalizedSearch || providerMatches
            ? allModels
            : allModels.filter((model) =>
                [model.name, model.id].some((value) =>
                  value.toLocaleLowerCase().includes(normalizedSearch)
                )
              )
        return providerMatches || models.length || !normalizedSearch
          ? [{ provider, models, providerModels: allModels, enabledCount }]
          : []
      }),
    [normalizedSearch, providerRows, showProvidersNeedingSetup]
  )
  const visibleModelCount = useMemo(
    () =>
      visibleProviders.reduce(
        (count, provider) => count + provider.models.length,
        0
      ),
    [visibleProviders]
  )

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:grid sm:gap-1">
          <CardTitle>{t("settings.models.cardTitle")}</CardTitle>
          <CardDescription>
            {t("settings.models.cardDescription")}
          </CardDescription>
          <CardAction className="flex w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t("settings.models.refresh")}
                  aria-busy={working === "refresh"}
                  disabled={working !== null}
                  onClick={() => void refreshSettings()}
                >
                  <RefreshCwIcon
                    className={
                      working === "refresh" ? "animate-spin" : undefined
                    }
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("settings.models.refresh")}
              </TooltipContent>
            </Tooltip>
            <Button
              ref={addProviderButtonRef}
              type="button"
              variant="outline"
              size="sm"
              disabled={working !== null}
              onClick={(event) => openAddProvider(event.currentTarget)}
            >
              <PlusIcon />
              {t("settings.models.addProvider")}
            </Button>
            <Badge variant={hasScope ? "default" : "outline"}>
              {hasScope
                ? t("settings.models.scopeEnabled")
                : t("settings.models.allAvailableModels")}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.models.enabledSummary", {
              enabled: enabledCount,
              total: settings.models.length,
            })}
          </p>
          {settings.scopeWarnings?.length ? (
            <ul
              role="status"
              className="rounded-lg bg-muted p-3 text-sm text-muted-foreground"
            >
              {settings.scopeWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <ModelSearchCard
        t={t}
        total={settings.models.length}
        visible={visibleModelCount}
        onSearchChange={handleModelSearchChange}
      />

      {!normalizedSearch && hiddenProviderCount > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-self-start"
          aria-expanded={showProvidersNeedingSetup}
          onClick={() => setShowProvidersNeedingSetup((current) => !current)}
        >
          {showProvidersNeedingSetup
            ? t("settings.models.hideProvidersNeedingSetup")
            : t("settings.models.showProvidersNeedingSetup", {
                count: hiddenProviderCount,
              })}
        </Button>
      ) : null}

      {error && !providerDialogOpen ? (
        <FieldError
          ref={errorRef}
          tabIndex={-1}
          className="rounded-lg bg-destructive/5 p-3"
        >
          {error}
        </FieldError>
      ) : null}

      {visibleProviders.length ? (
        visibleProviders.map(
          ({ provider, models, providerModels, enabledCount }) => {
            const enableProviderKey = `provider-scope:${provider.provider}:enable`
            const disableProviderKey = `provider-scope:${provider.provider}:disable`
            return (
              <Card key={provider.provider} className="overflow-hidden">
                <details
                  open={
                    Boolean(normalizedSearch) ||
                    !collapsedProviders.has(provider.provider)
                  }
                  className="group"
                  onToggle={(event) => {
                    if (normalizedSearch) return
                    const isOpen = event.currentTarget.open
                    setCollapsedProviders((current) => {
                      const next = new Set(current)
                      if (isOpen) next.delete(provider.provider)
                      else next.add(provider.provider)
                      return next
                    })
                  }}
                >
                  <summary
                    ref={(summary) => {
                      if (summary) {
                        providerSummaryRefs.current.set(
                          provider.provider,
                          summary
                        )
                      } else {
                        providerSummaryRefs.current.delete(provider.provider)
                      }
                    }}
                    className={`flex list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden ${normalizedSearch ? "cursor-default" : "cursor-pointer"}`}
                    onClick={(event) => {
                      if (normalizedSearch) event.preventDefault()
                    }}
                  >
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
                        {providerDescription(provider, t)}
                      </span>
                    </span>
                    <span
                      className="flex shrink-0 items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Badge
                        variant="outline"
                        title={authKindLabel(provider.authKind, t)}
                      >
                        {authStatusLabel(provider.authStatus, t)}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t(
                              "settings.models.enableProviderModels",
                              {
                                provider: provider.name ?? provider.provider,
                              }
                            )}
                            disabled={
                              working !== null ||
                              providerModels.length === 0 ||
                              enabledCount === providerModels.length
                            }
                            onClick={(event) => {
                              event.preventDefault()
                              void setProviderModelsEnabled(
                                provider.provider,
                                providerModels,
                                true
                              )
                            }}
                          >
                            {working === enableProviderKey ? (
                              <LoaderCircleIcon className="animate-spin" />
                            ) : (
                              <ListChecksIcon />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {t("settings.models.enableProviderModels", {
                            provider: provider.name ?? provider.provider,
                          })}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t(
                              "settings.models.disableProviderModels",
                              {
                                provider: provider.name ?? provider.provider,
                              }
                            )}
                            disabled={working !== null || enabledCount === 0}
                            onClick={(event) => {
                              event.preventDefault()
                              void setProviderModelsEnabled(
                                provider.provider,
                                providerModels,
                                false
                              )
                            }}
                          >
                            {working === disableProviderKey ? (
                              <LoaderCircleIcon className="animate-spin" />
                            ) : (
                              <ListXIcon />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {t("settings.models.disableProviderModels", {
                            provider: provider.name ?? provider.provider,
                          })}
                        </TooltipContent>
                      </Tooltip>
                      {provider.custom ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={t("settings.models.editProvider", {
                            provider: provider.provider,
                          })}
                          disabled={working !== null}
                          onClick={(event) => {
                            event.preventDefault()
                            openEditProvider(provider, event.currentTarget)
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
                          aria-label={t("settings.models.deleteProvider", {
                            provider: provider.provider,
                          })}
                          disabled={working !== null}
                          onClick={(event) => {
                            event.preventDefault()
                            requestRemoveProvider(provider.provider)
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
                            aria-busy={working === key}
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
                            <span className="flex shrink-0 items-center gap-2">
                              {working === key ? (
                                <LoaderCircleIcon
                                  aria-hidden="true"
                                  className="size-4 animate-spin text-muted-foreground"
                                />
                              ) : null}
                              <Switch
                                checked={model.enabled}
                                disabled={working !== null}
                                aria-label={t("settings.models.enableModel", {
                                  model: model.name,
                                })}
                                onCheckedChange={(enabled) =>
                                  void setModelEnabled(model, enabled)
                                }
                              />
                            </span>
                          </label>
                        )
                      })
                    ) : (
                      <p className="px-4 py-3 text-sm text-muted-foreground">
                        {provider.customModels.length
                          ? t("settings.models.savedModelsNoAuth")
                          : t("settings.models.noCurrentModels")}
                      </p>
                    )}
                  </CardContent>
                </details>
              </Card>
            )
          }
        )
      ) : normalizedSearch ? (
        <Empty className="min-h-48 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>{t("settings.models.noMatchesTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("settings.models.noMatchesDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          {t("settings.models.noConfigured")}
        </p>
      )}

      {providerDialogOpen ? (
        <CustomProviderForm
          open
          provider={editingProvider}
          working={working !== null}
          error={error}
          onOpenChange={setProviderDialog}
          onReturnFocus={() => providerDialogTriggerRef.current?.focus()}
          onSave={(value) => void saveProvider(value)}
        />
      ) : null}
      {pendingProviderDelete ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingProviderDelete(null)
          }}
          title={t("settings.models.confirmDeleteTitle")}
          description={t(pendingProviderDelete.confirmKey, {
            provider: pendingProviderDelete.provider,
          })}
          cancelLabel={t("settings.models.cancel")}
          confirmLabel={t("settings.models.delete")}
          onConfirm={() => void confirmRemoveProvider()}
        />
      ) : null}
    </div>
  )
}

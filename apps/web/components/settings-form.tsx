"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { useSidebar } from "@workspace/ui/components/sidebar"
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
  FieldError,
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

import { useI18n } from "@/components/i18n-provider"
import { ApiError, responseJson } from "@/lib/api-response"
import {
  configSchema,
  languageSchema,
  themeSchema,
  type AppConfig,
  type ConfigPatch,
} from "@/lib/config-schema"
import { translate } from "@/lib/i18n"

const serverSettingsSchema = configSchema.pick({
  revision: true,
  server: true,
})

const appearanceSettingsSchema = configSchema.pick({
  revision: true,
  appearance: true,
})

async function persistSettings(
  config: AppConfig,
  mutationToken: string,
  patch: ConfigPatch,
  fallbackError: string
) {
  const response = await fetch("/api/v1/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": `"revision-${config.revision}"`,
      "X-Pi-Web-Codex-Mutation-Token": mutationToken,
    },
    body: JSON.stringify(patch),
  })
  const parsed = configSchema.safeParse(
    await responseJson<unknown>(response, fallbackError)
  )
  if (!parsed.success) throw new ApiError(fallbackError)
  return parsed.data
}

function conflictServerSettings(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "ConfigConflict") {
    return null
  }
  const details = error.details
  const current =
    typeof details === "object" && details !== null && "current" in details
      ? details.current
      : undefined
  const parsed = serverSettingsSchema.safeParse(current)
  return parsed.success ? parsed.data : null
}

function conflictAppearanceSettings(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "ConfigConflict") {
    return null
  }
  const details = error.details
  const current =
    typeof details === "object" && details !== null && "current" in details
      ? details.current
      : undefined
  const parsed = appearanceSettingsSchema.safeParse(current)
  return parsed.success ? parsed.data : null
}

function settingsErrorMessage(
  error: unknown,
  fallback: string,
  conflict: string
) {
  if (error instanceof ApiError && error.code === "ConfigConflict") {
    return conflict
  }
  return error instanceof Error ? error.message : fallback
}

function SaveButton({
  pending,
  disabled = false,
}: {
  pending: boolean
  disabled?: boolean
}) {
  const { t } = useI18n()

  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? t("settings.common.saving") : t("settings.common.save")}
    </Button>
  )
}

export function GeneralSettingsForm({
  initial,
  mutationToken,
}: {
  initial: AppConfig
  mutationToken: string
}) {
  const [config, setConfig] = useState(initial)
  const [port, setPort] = useState(String(initial.server.port))
  const [openBrowser, setOpenBrowser] = useState(initial.server.openBrowser)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const busyRef = useRef(false)
  const errorRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const { t } = useI18n()
  const dirty =
    port !== String(config.server.port) ||
    openBrowser !== config.server.openBrowser

  useEffect(() => {
    if (!error || pending) return
    const frame = requestAnimationFrame(() => errorRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [error, pending])

  function reportError(message: string) {
    setError(message)
  }

  function submit() {
    if (busyRef.current || !dirty) return
    busyRef.current = true
    setError(null)
    startTransition(async () => {
      try {
        const saved = await persistSettings(
          config,
          mutationToken,
          {
            server: {
              port: Number(port),
              openBrowser,
            },
          },
          t("settings.common.saveFailed")
        )
        setConfig(saved)
        setPort(String(saved.server.port))
        setOpenBrowser(saved.server.openBrowser)
        router.refresh()
        toast.success(t("settings.general.saved"))
      } catch (error) {
        const current = conflictServerSettings(error)
        if (current) {
          const portChanged = port !== String(config.server.port)
          const openBrowserChanged = openBrowser !== config.server.openBrowser
          setConfig((value) => ({
            ...value,
            revision: current.revision,
            server: current.server,
          }))
          if (!portChanged) setPort(String(current.server.port))
          if (!openBrowserChanged) {
            setOpenBrowser(current.server.openBrowser)
          }
        } else {
          router.refresh()
        }
        const message = settingsErrorMessage(
          error,
          t("settings.common.saveFailed"),
          t("settings.common.conflict")
        )
        reportError(message)
        toast.error(message)
      } finally {
        busyRef.current = false
      }
    })
  }

  return (
    <form
      inert={pending}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.localService")}</CardTitle>
          <CardDescription>
            {t("settings.general.localServiceDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="host">
                  {t("settings.general.host")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.general.hostDescription")}
                </FieldDescription>
              </FieldContent>
              <Input
                id="host"
                value={config.server.host}
                disabled
                className="w-48"
              />
            </Field>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="port">
                  {t("settings.general.port")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.general.portDescription")}
                </FieldDescription>
              </FieldContent>
              <Input
                id="port"
                name="port"
                type="number"
                min={1}
                max={65535}
                required
                value={port}
                onChange={(event) => {
                  setPort(event.target.value)
                  setError(null)
                }}
                className="w-32"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{t("settings.general.openBrowser")}</FieldTitle>
                <FieldDescription>
                  {t("settings.general.openBrowserDescription")}
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={openBrowser}
                onCheckedChange={(value) => {
                  setOpenBrowser(value)
                  setError(null)
                }}
                aria-label={t("settings.general.openBrowser")}
              />
            </Field>
          </FieldGroup>
          {error ? (
            <FieldError
              ref={errorRef}
              tabIndex={-1}
              className="rounded-lg bg-destructive/5 p-3"
            >
              {error}
            </FieldError>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} disabled={!dirty} />
        </CardFooter>
      </Card>
    </form>
  )
}

export function AppearanceSettingsForm({
  initial,
  mutationToken,
}: {
  initial: AppConfig
  mutationToken: string
}) {
  const [theme, setThemeValue] = useState(initial.appearance.theme)
  const [language, setLanguage] = useState(initial.appearance.language)
  const [fontSize, setFontSize] = useState(String(initial.appearance.fontSize))
  const [sidebarWidthValue, setSidebarWidthValue] = useState(
    String(initial.appearance.sidebarWidth)
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const configRef = useRef(initial)
  const draftRef = useRef(initial.appearance)
  const queuedPatchRef = useRef<Partial<AppConfig["appearance"]> | null>(null)
  const savingRef = useRef(false)
  const errorRef = useRef<HTMLDivElement | null>(null)
  const { setTheme } = useTheme()
  const { setSidebarWidth } = useSidebar()
  const router = useRouter()
  const { setLocale, t } = useI18n()

  useEffect(() => {
    if (!error || saving) return
    const frame = requestAnimationFrame(() => errorRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [error, saving])

  function applyAppearance(appearance: AppConfig["appearance"]) {
    setThemeValue(appearance.theme)
    setTheme(appearance.theme)
    setLanguage(appearance.language)
    setLocale(appearance.language)
    setFontSize(String(appearance.fontSize))
    setSidebarWidthValue(String(appearance.sidebarWidth))
    document.documentElement.style.setProperty(
      "--app-font-size",
      `${appearance.fontSize}px`
    )
    document.documentElement.style.setProperty(
      "--app-sidebar-width",
      `${appearance.sidebarWidth}px`
    )
    setSidebarWidth(appearance.sidebarWidth)
  }

  function patchMatchesAppearance(
    patch: Partial<AppConfig["appearance"]>,
    appearance: AppConfig["appearance"]
  ) {
    return (
      (patch.theme === undefined || patch.theme === appearance.theme) &&
      (patch.language === undefined ||
        patch.language === appearance.language) &&
      (patch.fontSize === undefined ||
        patch.fontSize === appearance.fontSize) &&
      (patch.sidebarWidth === undefined ||
        patch.sidebarWidth === appearance.sidebarWidth)
    )
  }

  async function persistQueuedAppearance() {
    if (savingRef.current) return

    savingRef.current = true
    setSaving(true)
    let refreshServerContent = false

    try {
      while (queuedPatchRef.current) {
        const patch = queuedPatchRef.current
        queuedPatchRef.current = null

        try {
          const saved = await persistSettings(
            configRef.current,
            mutationToken,
            { appearance: patch },
            translate(draftRef.current.language, "settings.common.saveFailed")
          )
          configRef.current = saved
          refreshServerContent ||= patch.language !== undefined

          const next = {
            ...saved.appearance,
            ...(queuedPatchRef.current ?? {}),
          }
          draftRef.current = next
          applyAppearance(next)
        } catch (error) {
          const current = conflictAppearanceSettings(error)
          if (current) {
            configRef.current = {
              ...configRef.current,
              revision: current.revision,
              appearance: current.appearance,
            }
            const retryPatch = patchMatchesAppearance(patch, current.appearance)
              ? {}
              : patch
            const queuedPatch = {
              ...retryPatch,
              ...(queuedPatchRef.current ?? {}),
            }
            queuedPatchRef.current = Object.keys(queuedPatch).length
              ? queuedPatch
              : null
            const next = { ...current.appearance, ...queuedPatch }
            draftRef.current = next
            applyAppearance(next)
            refreshServerContent ||=
              patch.language !== undefined &&
              patch.language === current.appearance.language
            continue
          }

          const unsavedPatch = {
            ...patch,
            ...(queuedPatchRef.current ?? {}),
          }
          queuedPatchRef.current = unsavedPatch
          draftRef.current = {
            ...configRef.current.appearance,
            ...unsavedPatch,
          }
          applyAppearance(draftRef.current)
          const locale = draftRef.current.language
          const message = settingsErrorMessage(
            error,
            translate(locale, "settings.common.saveFailed"),
            translate(locale, "settings.common.conflict")
          )
          setError(message)
          toast.error(message)
          break
        }
      }
    } finally {
      savingRef.current = false
      setSaving(false)
      if (refreshServerContent) router.refresh()
    }
  }

  function updateAppearance(patch: Partial<AppConfig["appearance"]>) {
    const next = { ...draftRef.current, ...patch }
    draftRef.current = next
    applyAppearance(next)
    queuedPatchRef.current = {
      ...(queuedPatchRef.current ?? {}),
      ...patch,
    }
    setError(null)
    void persistQueuedAppearance()
  }

  function parseIntegerInRange(value: string, min: number, max: number) {
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed >= min && parsed <= max
      ? parsed
      : null
  }

  return (
    <Card aria-busy={saving}>
      <CardHeader>
        <CardTitle>{t("settings.appearance.interface")}</CardTitle>
        <CardDescription>
          {t("settings.appearance.interfaceDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="theme">
                {t("settings.appearance.theme")}
              </FieldLabel>
              <FieldDescription>
                {t("settings.appearance.themeDescription")}
              </FieldDescription>
            </FieldContent>
            <Select
              value={theme}
              onValueChange={(value) => {
                updateAppearance({ theme: themeSchema.parse(value) })
              }}
            >
              <SelectTrigger id="theme" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="system">
                    {t("settings.appearance.system")}
                  </SelectItem>
                  <SelectItem value="light">
                    {t("settings.appearance.light")}
                  </SelectItem>
                  <SelectItem value="dark">
                    {t("settings.appearance.dark")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="language">
                {t("settings.appearance.language")}
              </FieldLabel>
              <FieldDescription>
                {t("settings.appearance.languageDescription")}
              </FieldDescription>
            </FieldContent>
            <Select
              value={language}
              onValueChange={(value) => {
                updateAppearance({ language: languageSchema.parse(value) })
              }}
            >
              <SelectTrigger id="language" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="zh-CN">
                    {t("settings.appearance.chinese")}
                  </SelectItem>
                  <SelectItem value="en-US">
                    {t("settings.appearance.english")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="fontSize">
                {t("settings.appearance.fontSize")}
              </FieldLabel>
              <FieldDescription>
                {t("settings.appearance.fontSizeDescription")}
              </FieldDescription>
            </FieldContent>
            <Input
              id="fontSize"
              name="fontSize"
              type="number"
              min={12}
              max={18}
              required
              value={fontSize}
              onChange={(event) => {
                const value = event.target.value
                setFontSize(value)
                setError(null)
                const parsed = parseIntegerInRange(value, 12, 18)
                if (parsed !== null) updateAppearance({ fontSize: parsed })
              }}
              onBlur={() => {
                if (parseIntegerInRange(fontSize, 12, 18) === null) {
                  setFontSize(String(draftRef.current.fontSize))
                }
              }}
              className="w-32"
            />
          </Field>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel htmlFor="sidebarWidth">
                {t("settings.appearance.sidebarWidth")}
              </FieldLabel>
              <FieldDescription>
                {t("settings.appearance.sidebarWidthDescription")}
              </FieldDescription>
            </FieldContent>
            <Input
              id="sidebarWidth"
              name="sidebarWidth"
              type="number"
              min={240}
              max={360}
              required
              value={sidebarWidthValue}
              onChange={(event) => {
                const value = event.target.value
                setSidebarWidthValue(value)
                setError(null)
                const parsed = parseIntegerInRange(value, 240, 360)
                if (parsed !== null) {
                  updateAppearance({ sidebarWidth: parsed })
                }
              }}
              onBlur={() => {
                if (parseIntegerInRange(sidebarWidthValue, 240, 360) === null) {
                  setSidebarWidthValue(String(draftRef.current.sidebarWidth))
                }
              }}
              className="w-32"
            />
          </Field>
        </FieldGroup>
        {error ? (
          <FieldError
            ref={errorRef}
            tabIndex={-1}
            className="rounded-lg bg-destructive/5 p-3"
          >
            {error}
          </FieldError>
        ) : null}
      </CardContent>
    </Card>
  )
}

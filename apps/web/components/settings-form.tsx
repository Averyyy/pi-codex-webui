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
  const [config, setConfig] = useState(initial)
  const [theme, setThemeValue] = useState(initial.appearance.theme)
  const [language, setLanguage] = useState(initial.appearance.language)
  const [fontSize, setFontSize] = useState(String(initial.appearance.fontSize))
  const [sidebarWidthValue, setSidebarWidthValue] = useState(
    String(initial.appearance.sidebarWidth)
  )
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const busyRef = useRef(false)
  const errorRef = useRef<HTMLDivElement | null>(null)
  const { setTheme } = useTheme()
  const { setSidebarWidth } = useSidebar()
  const router = useRouter()
  const { setLocale, t } = useI18n()
  const dirty =
    theme !== config.appearance.theme ||
    language !== config.appearance.language ||
    fontSize !== String(config.appearance.fontSize) ||
    sidebarWidthValue !== String(config.appearance.sidebarWidth)

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
            appearance: {
              theme,
              language,
              fontSize: Number(fontSize),
              sidebarWidth: Number(sidebarWidthValue),
            },
          },
          t("settings.common.saveFailed")
        )
        setConfig(saved)
        setThemeValue(saved.appearance.theme)
        setTheme(saved.appearance.theme)
        setLanguage(saved.appearance.language)
        setFontSize(String(saved.appearance.fontSize))
        setSidebarWidthValue(String(saved.appearance.sidebarWidth))
        setLocale(saved.appearance.language)
        document.documentElement.style.setProperty(
          "--app-font-size",
          `${saved.appearance.fontSize}px`
        )
        document.documentElement.style.setProperty(
          "--app-sidebar-width",
          `${saved.appearance.sidebarWidth}px`
        )
        setSidebarWidth(saved.appearance.sidebarWidth)
        router.refresh()
        toast.success(
          translate(saved.appearance.language, "settings.appearance.saved")
        )
      } catch (error) {
        const current = conflictAppearanceSettings(error)
        let conflictLanguage = config.appearance.language
        if (current) {
          const themeChanged = theme !== config.appearance.theme
          const languageChanged = language !== config.appearance.language
          const fontSizeChanged =
            fontSize !== String(config.appearance.fontSize)
          const sidebarWidthChanged =
            sidebarWidthValue !== String(config.appearance.sidebarWidth)
          setConfig((value) => ({
            ...value,
            revision: current.revision,
            appearance: current.appearance,
          }))
          if (!themeChanged) {
            setThemeValue(current.appearance.theme)
            setTheme(current.appearance.theme)
          }
          if (!languageChanged) {
            conflictLanguage = current.appearance.language
            setLanguage(current.appearance.language)
            setLocale(current.appearance.language)
          }
          if (!fontSizeChanged) {
            setFontSize(String(current.appearance.fontSize))
            document.documentElement.style.setProperty(
              "--app-font-size",
              `${current.appearance.fontSize}px`
            )
          }
          if (!sidebarWidthChanged) {
            setSidebarWidthValue(String(current.appearance.sidebarWidth))
            document.documentElement.style.setProperty(
              "--app-sidebar-width",
              `${current.appearance.sidebarWidth}px`
            )
            setSidebarWidth(current.appearance.sidebarWidth)
          }
        } else {
          router.refresh()
        }
        const message = current
          ? translate(conflictLanguage, "settings.common.conflict")
          : settingsErrorMessage(
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
                  setThemeValue(themeSchema.parse(value))
                  setError(null)
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
                  setLanguage(languageSchema.parse(value))
                  setError(null)
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
                  setFontSize(event.target.value)
                  setError(null)
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
                  setSidebarWidthValue(event.target.value)
                  setError(null)
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
        <CardFooter className="justify-end">
          <SaveButton pending={pending} disabled={!dirty} />
        </CardFooter>
      </Card>
    </form>
  )
}

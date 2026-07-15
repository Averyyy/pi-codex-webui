"use client"

import { useState, useTransition } from "react"
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
import {
  languageSchema,
  themeSchema,
  type AppConfig,
  type ConfigPatch,
} from "@/lib/config-schema"
import { translate } from "@/lib/i18n"

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
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error ?? fallbackError)
  }
  return result as AppConfig
}

function SaveButton({ pending }: { pending: boolean }) {
  const { t } = useI18n()

  return (
    <Button type="submit" disabled={pending}>
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
  const [openBrowser, setOpenBrowser] = useState(initial.server.openBrowser)
  const [pending, startTransition] = useTransition()
  const router = useRouter()
  const { t } = useI18n()

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const saved = await persistSettings(
          config,
          mutationToken,
          {
            server: {
              port: Number(formData.get("port")),
              openBrowser,
            },
          },
          t("settings.common.saveFailed")
        )
        setConfig(saved)
        router.refresh()
        toast.success(t("settings.general.saved"))
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings.common.saveFailed")
        )
      }
    })
  }

  return (
    <form action={submit}>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.localService")}</CardTitle>
          <CardDescription>
            {t("settings.general.localServiceDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                defaultValue={config.server.port}
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
                onCheckedChange={setOpenBrowser}
                aria-label={t("settings.general.openBrowser")}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} />
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
  const [pending, startTransition] = useTransition()
  const { setTheme } = useTheme()
  const { setSidebarWidth } = useSidebar()
  const router = useRouter()
  const { setLocale, t } = useI18n()

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const saved = await persistSettings(
          config,
          mutationToken,
          {
            appearance: {
              theme,
              language,
              fontSize: Number(formData.get("fontSize")),
              sidebarWidth: Number(formData.get("sidebarWidth")),
            },
          },
          t("settings.common.saveFailed")
        )
        setConfig(saved)
        setTheme(saved.appearance.theme)
        setLanguage(saved.appearance.language)
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
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings.common.saveFailed")
        )
      }
    })
  }

  return (
    <form action={submit}>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.appearance.interface")}</CardTitle>
          <CardDescription>
            {t("settings.appearance.interfaceDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                onValueChange={(value) =>
                  setThemeValue(themeSchema.parse(value))
                }
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
                onValueChange={(value) =>
                  setLanguage(languageSchema.parse(value))
                }
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
                defaultValue={config.appearance.fontSize}
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
                defaultValue={config.appearance.sidebarWidth}
                className="w-32"
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} />
        </CardFooter>
      </Card>
    </form>
  )
}

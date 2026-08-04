"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2Icon, LoaderCircleIcon, UnplugIcon } from "lucide-react"
import { toast } from "sonner"
import { z } from "zod"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
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
import { ApiError, validatedResponseJson } from "@/lib/api-response"
import {
  runtimeSettingsViewSchema,
  type RuntimeSettingsView,
} from "@/lib/config-schema"

const diagnosticResultSchema = z.object({
  ok: z.literal(true),
  kind: z.enum(["pi", "pi-client"]),
  latencyMs: z.number().int().nonnegative(),
  sessionCount: z.number().int().nonnegative().optional(),
})

type DiagnosticResult = z.infer<typeof diagnosticResultSchema>

function piClientProfile(profiles: RuntimeSettingsView["profiles"]) {
  const profile = profiles.find((candidate) => candidate.kind === "pi-client")
  if (!profile) throw new Error("Pi Client runtime profile is missing.")
  return profile
}

function conflictRuntimeSettings(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "ConfigConflict") {
    return null
  }
  const details = error.details
  const current =
    typeof details === "object" && details !== null && "current" in details
      ? details.current
      : null
  const parsed = runtimeSettingsViewSchema.safeParse(current)
  return parsed.success ? parsed.data : null
}

export function RuntimeSettingsForm({
  initial,
  mutationToken,
}: {
  initial: RuntimeSettingsView
  mutationToken: string
}) {
  const { t } = useI18n()
  const [saved, setSaved] = useState(initial)
  const savedClient = useMemo(() => piClientProfile(saved.profiles), [saved])

  const [enabled, setEnabled] = useState(savedClient.enabled)
  const [serverUrl, setServerUrl] = useState(savedClient.serverUrl ?? "")
  const [defaultProfileId, setDefaultProfileId] = useState(
    saved.defaultProfileId
  )
  const [authToken, setAuthToken] = useState("")
  const [clearAuthToken, setClearAuthToken] = useState(false)
  const [diagnostic, setDiagnostic] = useState<DiagnosticResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()
  const [testing, startTesting] = useTransition()
  const busyRef = useRef(false)
  const errorRef = useRef<HTMLDivElement | null>(null)
  const router = useRouter()
  const dirty =
    enabled !== savedClient.enabled ||
    serverUrl !== (savedClient.serverUrl ?? "") ||
    defaultProfileId !== saved.defaultProfileId ||
    authToken.length > 0 ||
    clearAuthToken

  useEffect(() => {
    if (!error || saving || testing) return
    const frame = requestAnimationFrame(() => errorRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [error, saving, testing])

  function reportError(message: string) {
    setError(message)
  }

  function updateEnabled(next: boolean) {
    setError(null)
    setDiagnostic(null)
    setEnabled(next)
    if (!next && defaultProfileId === savedClient.id) {
      setDefaultProfileId("pi")
    }
  }

  function updateDefault(profileId: string) {
    setError(null)
    setDiagnostic(null)
    setDefaultProfileId(profileId)
    if (profileId === savedClient.id) setEnabled(true)
  }

  function save() {
    if (busyRef.current || !dirty) return
    busyRef.current = true
    setError(null)
    setDiagnostic(null)
    startSaving(async () => {
      try {
        const response = await fetch(
          `/api/v1/runtimes/${encodeURIComponent(savedClient.id)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "If-Match": `"revision-${saved.revision}"`,
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
            body: JSON.stringify({
              enabled,
              serverUrl,
              defaultProfileId,
              ...(authToken ? { authToken } : {}),
              clearAuthToken,
            }),
          }
        )
        const result = await validatedResponseJson(
          response,
          (value) => runtimeSettingsViewSchema.parse(value),
          t("settings.runtime.saveFailed")
        )

        setSaved(result)
        const client = piClientProfile(result.profiles)
        setEnabled(client.enabled)
        setServerUrl(client.serverUrl ?? "")
        setDefaultProfileId(result.defaultProfileId)
        setAuthToken("")
        setClearAuthToken(false)
        setDiagnostic(null)
        router.refresh()
        toast.success(t("settings.runtime.saved"))
      } catch (error) {
        const current = conflictRuntimeSettings(error)
        if (current) {
          const latestClient = piClientProfile(current.profiles)
          const enabledChanged = enabled !== savedClient.enabled
          const serverUrlChanged = serverUrl !== (savedClient.serverUrl ?? "")
          const defaultChanged = defaultProfileId !== saved.defaultProfileId
          setSaved(current)
          if (!enabledChanged) setEnabled(latestClient.enabled)
          if (!serverUrlChanged) {
            setServerUrl(latestClient.serverUrl ?? "")
          }
          if (!defaultChanged) setDefaultProfileId(current.defaultProfileId)
        } else {
          router.refresh()
        }
        const message =
          error instanceof ApiError && error.code === "ConfigConflict"
            ? t("settings.common.conflict")
            : error instanceof Error
              ? error.message
              : t("settings.runtime.saveFailed")
        reportError(message)
        toast.error(message)
      } finally {
        busyRef.current = false
      }
    })
  }

  function testConnection() {
    if (busyRef.current || dirty || !savedClient.serverUrl) return
    busyRef.current = true
    setError(null)
    startTesting(async () => {
      setDiagnostic(null)
      try {
        const response = await fetch(
          `/api/v1/runtimes/${encodeURIComponent(savedClient.id)}/test`,
          {
            method: "POST",
            headers: {
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
          }
        )
        const result = await validatedResponseJson(
          response,
          (value) => diagnosticResultSchema.parse(value),
          t("settings.runtime.testFailed")
        )
        setDiagnostic(result)
        toast.success(t("settings.runtime.connected"))
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("settings.runtime.testFailed")
        reportError(message)
        toast.error(message)
      } finally {
        busyRef.current = false
      }
    })
  }

  return (
    <form
      inert={saving || testing}
      aria-busy={saving || testing}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.runtime.title")}</CardTitle>
          <CardDescription>{t("settings.runtime.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="default-runtime">
                  {t("settings.runtime.default")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.runtime.defaultDescription")}
                </FieldDescription>
              </FieldContent>
              <Select value={defaultProfileId} onValueChange={updateDefault}>
                <SelectTrigger id="default-runtime" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="pi">Pi</SelectItem>
                    <SelectItem value={savedClient.id}>Pi Client</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{t("settings.runtime.enableClient")}</FieldTitle>
                <FieldDescription>
                  {t("settings.runtime.clientDescription")}
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={enabled}
                onCheckedChange={updateEnabled}
                aria-label={t("settings.runtime.enableClient")}
              />
            </Field>

            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="pi-server-url">
                  {t("settings.runtime.serverUrl")}
                </FieldLabel>
                <FieldDescription>
                  {t("settings.runtime.serverUrlDescription")}
                </FieldDescription>
              </FieldContent>
              <Input
                id="pi-server-url"
                type="url"
                required={enabled}
                value={serverUrl}
                onChange={(event) => {
                  setServerUrl(event.target.value)
                  setError(null)
                  setDiagnostic(null)
                }}
                placeholder="http://127.0.0.1:4217"
                className="w-full max-w-sm"
              />
            </Field>

            <Field orientation="responsive">
              <FieldContent>
                <div className="flex items-center gap-2">
                  <FieldLabel htmlFor="pi-server-token">
                    {t("settings.runtime.authToken")}
                  </FieldLabel>
                  {savedClient.hasAuthToken && !clearAuthToken ? (
                    <Badge variant="secondary">
                      {t("settings.runtime.savedSecurely")}
                    </Badge>
                  ) : null}
                </div>
                <FieldDescription>
                  {t("settings.runtime.authDescription")}
                </FieldDescription>
              </FieldContent>
              <div className="flex w-full max-w-sm items-center gap-2">
                <Input
                  id="pi-server-token"
                  type="password"
                  value={authToken}
                  onChange={(event) => {
                    setAuthToken(event.target.value)
                    setError(null)
                    setDiagnostic(null)
                    if (event.target.value) setClearAuthToken(false)
                  }}
                  placeholder={
                    savedClient.hasAuthToken
                      ? t("settings.runtime.keepToken")
                      : t("settings.provider.optional")
                  }
                />
                {savedClient.hasAuthToken ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setClearAuthToken((current) => !current)
                      setAuthToken("")
                      setError(null)
                      setDiagnostic(null)
                    }}
                  >
                    {clearAuthToken
                      ? t("settings.runtime.keep")
                      : t("settings.runtime.removeToken")}
                  </Button>
                ) : null}
              </div>
            </Field>

            {diagnostic ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                <CheckCircle2Icon className="size-4 text-success" />
                {t("settings.runtime.response", {
                  latency: diagnostic.latencyMs,
                })}
                {diagnostic.sessionCount === undefined
                  ? null
                  : ` · ${t(
                      diagnostic.sessionCount === 1
                        ? "settings.runtime.sessionCountOne"
                        : "settings.runtime.sessionCountMany",
                      {
                        count: diagnostic.sessionCount,
                      }
                    )}`}
              </div>
            ) : null}
            {error ? (
              <FieldError
                ref={errorRef}
                tabIndex={-1}
                className="rounded-lg bg-destructive/5 p-3"
              >
                {error}
              </FieldError>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={testConnection}
            disabled={testing || dirty || !savedClient.serverUrl}
            title={dirty ? t("settings.runtime.saveCurrent") : undefined}
          >
            {testing ? (
              <LoaderCircleIcon className="animate-spin" />
            ) : (
              <UnplugIcon />
            )}
            {t("settings.runtime.testSaved")}
          </Button>
          <Button type="submit" disabled={saving || !dirty}>
            {saving ? t("settings.common.saving") : t("settings.common.save")}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}

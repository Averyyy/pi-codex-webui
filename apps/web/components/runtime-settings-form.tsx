"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2Icon, LoaderCircleIcon, UnplugIcon } from "lucide-react"
import { toast } from "sonner"

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

interface RuntimeProfileView {
  id: string
  kind: "pi" | "pi-client"
  enabled: boolean
  isDefault: boolean
  serverUrl?: string
  hasAuthToken?: boolean
}

interface RuntimeSettingsView {
  revision: number
  defaultProfileId: string
  profiles: RuntimeProfileView[]
}

interface DiagnosticResult {
  ok: true
  latencyMs: number
  sessionCount?: number
}

function piClientProfile(profiles: RuntimeProfileView[]) {
  const profile = profiles.find((candidate) => candidate.kind === "pi-client")
  if (!profile) throw new Error("Pi Client runtime profile is missing.")
  return profile
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
  const [saving, startSaving] = useTransition()
  const [testing, startTesting] = useTransition()
  const router = useRouter()
  const dirty =
    enabled !== savedClient.enabled ||
    serverUrl !== (savedClient.serverUrl ?? "") ||
    defaultProfileId !== saved.defaultProfileId ||
    authToken.length > 0 ||
    clearAuthToken

  function updateEnabled(next: boolean) {
    setEnabled(next)
    if (!next && defaultProfileId === savedClient.id) {
      setDefaultProfileId("pi")
    }
  }

  function updateDefault(profileId: string) {
    setDefaultProfileId(profileId)
    if (profileId === savedClient.id) setEnabled(true)
  }

  function save() {
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
        const result = (await response.json()) as RuntimeSettingsView & {
          error?: string
        }
        if (!response.ok) {
          throw new Error(result.error ?? t("settings.runtime.saveFailed"))
        }

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
        router.refresh()
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings.runtime.saveFailed")
        )
      }
    })
  }

  function testConnection() {
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
        const result = (await response.json()) as DiagnosticResult & {
          error?: string
        }
        if (!response.ok) {
          throw new Error(result.error ?? t("settings.runtime.testFailed"))
        }
        setDiagnostic(result)
        toast.success(t("settings.runtime.connected"))
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings.runtime.testFailed")
        )
      }
    })
  }

  return (
    <Card inert={saving || testing} aria-busy={saving || testing}>
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
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
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
                : ` · ${diagnostic.sessionCount} sessions`}
            </div>
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
        <Button type="button" onClick={save} disabled={saving || !dirty}>
          {saving ? t("settings.common.saving") : t("settings.common.save")}
        </Button>
      </CardFooter>
    </Card>
  )
}

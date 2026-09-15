"use client"
import { useEffect, useState, type ComponentProps } from "react"
import {
  modelSettingsSchema,
  type ModelSettings,
} from "@workspace/runtime-protocol"
import { NewConversation } from "@/components/new-conversation"
import { useI18n } from "@/components/i18n-provider"
import { responseJson } from "@/lib/api-response"

export function NewConversationLoader(
  props: Omit<ComponentProps<typeof NewConversation>, "initialModelSettings">
) {
  const { locale } = useI18n()
  const [result, setResult] = useState<{
    projectId: string | null
    settings: ModelSettings
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams(
      props.initialProjectId
        ? { projectId: props.initialProjectId }
        : { newTask: "1" }
    )
    params.set("scope", "enabled")
    void (async () => {
      setError(null)
      try {
        const settings = modelSettingsSchema.parse(
          await responseJson(
            await fetch(`/api/v1/model-settings?${params}`, {
              signal: controller.signal,
            })
          )
        )
        if (!controller.signal.aborted)
          setResult({ projectId: props.initialProjectId, settings })
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : String(failure))
      }
    })()
    return () => controller.abort()
  }, [props.initialProjectId, revision])
  const settings =
    result?.projectId === props.initialProjectId ? result.settings : null
  return (
    <>
      {!settings ? (
        <div
          role={error ? "alert" : "status"}
          className="px-4 py-2 text-sm text-muted-foreground"
        >
          {error ??
            (locale === "zh-CN"
              ? "正在加载模型，可以先输入消息…"
              : "Loading models. You can start typing…")}
          {error ? (
            <button
              className="ml-3 underline"
              onClick={() => setRevision((value) => value + 1)}
            >
              {locale === "zh-CN" ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
      ) : null}
      <NewConversation {...props} initialModelSettings={settings} />
    </>
  )
}

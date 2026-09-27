"use client"

import type { ComponentProps } from "react"

import { NewConversation } from "@/components/new-conversation"
import { useI18n } from "@/components/i18n-provider"
import { useModelCatalog } from "@/hooks/use-model-catalog"

export function NewConversationLoader(
  props: Omit<
    ComponentProps<typeof NewConversation>,
    "initialModelSettings" | "initialModelCatalogIdentity"
  >
) {
  const { locale } = useI18n()
  const catalog = useModelCatalog(
    props.initialProjectId === null
      ? { newTask: true }
      : { projectId: props.initialProjectId },
    "enabled"
  )
  const settings = catalog.snapshot

  return (
    <>
      {!settings ? (
        <div
          role={catalog.error ? "alert" : "status"}
          className="px-4 py-2 text-sm text-muted-foreground"
        >
          {catalog.error ??
            (locale === "zh-CN"
              ? "正在加载模型，可以先输入消息…"
              : "Loading models. You can start typing…")}
          {catalog.error ? (
            <button
              className="ml-3 underline"
              onClick={() => void catalog.retry().catch(() => undefined)}
            >
              {locale === "zh-CN" ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
      ) : catalog.error ? (
        <p role="status" className="px-4 py-1 text-xs text-muted-foreground">
          {locale === "zh-CN"
            ? "模型目录暂时无法更新，正在使用上次加载的目录。"
            : "The model catalog could not be updated. Using the last loaded catalog."}
          <button
            className="ml-2 underline"
            onClick={() => void catalog.retry().catch(() => undefined)}
          >
            {locale === "zh-CN" ? "重试" : "Retry"}
          </button>
        </p>
      ) : null}
      <NewConversation
        {...props}
        initialModelSettings={settings}
        initialModelCatalogIdentity={catalog.catalogIdentity}
      />
    </>
  )
}

"use client"

import { Input } from "@workspace/ui/components/input"
import { useI18n } from "@/components/i18n-provider"

export function ConversationSearchInput({
  defaultValue,
}: {
  defaultValue: string
}) {
  const { t } = useI18n()

  return (
    <Input
      id="conversation-search"
      name="q"
      type="search"
      defaultValue={defaultValue}
      placeholder={t("search.placeholder")}
      enterKeyHint="search"
      autoFocus
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.currentTarget.form?.requestSubmit()
      }}
    />
  )
}

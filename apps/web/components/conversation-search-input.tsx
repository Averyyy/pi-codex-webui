"use client"

import { useFormStatus } from "react-dom"
import { LoaderCircleIcon, SearchIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
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

export function ConversationSearchSubmitButton() {
  const { pending } = useFormStatus()
  const { t } = useI18n()

  return (
    <Button
      type="submit"
      aria-busy={pending}
      aria-disabled={pending}
      onClick={(event) => {
        if (pending) event.preventDefault()
      }}
    >
      {pending ? (
        <LoaderCircleIcon
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
        />
      ) : (
        <SearchIcon data-icon="inline-start" />
      )}
      {pending ? t("search.submitting") : t("search.submit")}
    </Button>
  )
}

"use client"

import { Input } from "@workspace/ui/components/input"

export function ConversationSearchInput({
  defaultValue,
}: {
  defaultValue: string
}) {
  return (
    <Input
      id="conversation-search"
      name="q"
      type="search"
      defaultValue={defaultValue}
      placeholder="输入关键词"
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

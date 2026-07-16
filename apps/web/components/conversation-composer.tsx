"use client"

import Link from "next/link"
import type {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  Ref,
} from "react"
import { useRef, useState } from "react"
import {
  ArrowUpIcon,
  ImagePlusIcon,
  LoaderCircleIcon,
  Settings2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import type { RuntimeModel, ThinkingLevel } from "@workspace/runtime-protocol"
import { cn } from "@workspace/ui/lib/utils"

import {
  ComposerImagePreviews,
  type ComposerImage,
} from "@/components/composer-image-attachments"
import {
  ComposerCommandMenu,
  composerSlashCommandQuery,
  filterComposerCommands,
  removeComposerSlashCommand,
  type ComposerCommand,
} from "@/components/composer-command-menu"

function modelValue(model: { provider: string; id: string }) {
  return JSON.stringify([model.provider, model.id])
}

const imageCommandId = "image"

function noop() {}

export function ConversationComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder = "向 Pi 发送消息",
  ariaLabel = "向 Pi 发送消息",
  autoFocus = false,
  submitting = false,
  sendDisabled = false,
  editor,
  actions,
  endActions,
  settings,
  images = [],
  imageError,
  imagesSupported = false,
  onImagesAdd,
  onImageRemove,
  onCycleThinkingLevel,
  textareaRef,
  className,
  commands = [],
}: {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
  submitting?: boolean
  sendDisabled?: boolean
  editor?: ReactNode
  actions?: ReactNode
  endActions?: ReactNode
  settings?: ReactNode
  images?: ComposerImage[]
  imageError?: string | null
  imagesSupported?: boolean
  onImagesAdd?: (files: File[]) => void | Promise<void>
  onImageRemove?: (id: string) => void
  onCycleThinkingLevel?: () => void
  textareaRef?: Ref<HTMLTextAreaElement>
  className?: string
  commands?: ComposerCommand[]
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState("")
  const [openedWithSlash, setOpenedWithSlash] = useState(false)
  const availableCommands: ComposerCommand[] = [
    ...commands,
    {
      id: imageCommandId,
      label: "图片",
      description: imagesSupported ? "添加到当前消息" : "当前模型不支持图片",
      icon: ImagePlusIcon,
      disabled: !imagesSupported || submitting || !onImagesAdd,
      onSelect: noop,
    },
  ]
  const matchingCommands = filterComposerCommands(
    availableCommands,
    commandQuery
  )

  function closeCommandMenu() {
    setCommandMenuOpen(false)
    setCommandQuery("")
    setOpenedWithSlash(false)
  }

  function handleValueChange(nextValue: string) {
    onValueChange(nextValue)
    const nextQuery = composerSlashCommandQuery(nextValue)
    if (nextQuery === null) {
      closeCommandMenu()
      return
    }
    setCommandQuery(nextQuery)
    setOpenedWithSlash(true)
    setCommandMenuOpen(true)
  }

  function handleCommandSelect(command: ComposerCommand) {
    const removeSlashCommand = openedWithSlash
    closeCommandMenu()
    if (removeSlashCommand) {
      onValueChange(removeComposerSlashCommand(value))
    }
    if (command.id === imageCommandId) {
      imageInputRef.current?.click()
      return
    }
    command.onSelect()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (openedWithSlash && commandMenuOpen) {
      if (event.key === "Escape") {
        closeCommandMenu()
        return
      }
      if (event.key === "Enter" || (event.key === "Tab" && !event.shiftKey)) {
        const command = matchingCommands.find((item) => !item.disabled)
        if (command) {
          event.preventDefault()
          handleCommandSelect(command)
          return
        }
      }
    }
    if (
      event.key === "Tab" &&
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      onCycleThinkingLevel
    ) {
      event.preventDefault()
      onCycleThinkingLevel()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/")
    )
    if (files.length === 0 || !onImagesAdd) return

    event.preventDefault()
    if (!imagesSupported) {
      toast.error("当前模型不支持图片。")
      return
    }
    void onImagesAdd(files)
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn("rounded-2xl border bg-card p-2 shadow-sm", className)}
    >
      {settings || editor === undefined ? (
        <div className="flex flex-wrap items-center gap-2 border-b px-1 pb-2">
          {editor === undefined ? (
            <>
              <ComposerCommandMenu
                open={commandMenuOpen}
                onOpenChange={(open) => {
                  setCommandMenuOpen(open)
                  if (!open) {
                    setCommandQuery("")
                    setOpenedWithSlash(false)
                  }
                }}
                commands={availableCommands}
                query={commandQuery}
                preserveInputFocus={openedWithSlash}
                onTriggerClick={() => {
                  setCommandQuery("")
                  setOpenedWithSlash(false)
                }}
                onCommandSelect={handleCommandSelect}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? [])
                  event.currentTarget.value = ""
                  if (files.length) void onImagesAdd?.(files)
                }}
              />
            </>
          ) : null}
          {settings}
        </div>
      ) : null}
      <ComposerImagePreviews
        images={images}
        error={imageError}
        onRemove={onImageRemove}
      />
      {editor ?? (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => handleValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoFocus={autoFocus}
          className="min-h-24 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 sm:min-h-20"
        />
      )}
      <div className="flex flex-wrap items-center gap-2 px-1 pb-1">
        {actions}
        <div className="ml-auto flex items-center gap-2">
          {endActions}
          {editor === undefined ? (
            <Button
              type="submit"
              size="icon"
              className="rounded-full"
              disabled={
                (!value.trim() && images.length === 0) ||
                submitting ||
                sendDisabled
              }
              aria-label="发送"
            >
              {submitting ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <ArrowUpIcon />
              )}
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  )
}

export function ComposerModelSelect<T extends RuntimeModel>({
  model,
  models,
  onModelChange,
  disabled = false,
  settingsHref,
}: {
  model: Pick<RuntimeModel, "provider" | "id"> | null
  models: T[]
  onModelChange: (model: T) => void
  disabled?: boolean
  settingsHref: string
}) {
  const selected = model
    ? models.find((available) => modelValue(available) === modelValue(model))
    : null

  if (!selected) {
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={settingsHref}>
          <Settings2Icon />
          选择模型
        </Link>
      </Button>
    )
  }

  return (
    <Select
      value={modelValue(selected)}
      onValueChange={(value) => {
        const next = models.find((available) => modelValue(available) === value)
        if (!next) throw new Error("选择的模型不再可用。")
        onModelChange(next)
      }}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="max-w-56" aria-label="模型">
        <SelectValue>
          {selected.provider} / {selected.name}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        side="top"
        footer={
          <Button
            asChild
            className="w-full justify-start"
            size="sm"
            variant="ghost"
          >
            <Link href={settingsHref}>
              <Settings2Icon />
              管理 Provider / Model scope
            </Link>
          </Button>
        }
      >
        <SelectGroup>
          {models.map((available) => (
            <SelectItem
              key={modelValue(available)}
              value={modelValue(available)}
            >
              {available.provider} / {available.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function ComposerThinkingSelect({
  level,
  levels,
  onLevelChange,
  disabled = false,
}: {
  level: ThinkingLevel
  levels: ThinkingLevel[]
  onLevelChange: (level: ThinkingLevel) => void
  disabled?: boolean
}) {
  if (levels.length === 0) return null

  return (
    <Select
      value={level}
      onValueChange={(value) => {
        const next = levels.find((available) => available === value)
        if (!next) throw new Error("选择的 thinking level 不再可用。")
        onLevelChange(next)
      }}
      disabled={disabled || levels.length < 2}
    >
      <SelectTrigger
        size="sm"
        aria-label="Reasoning effort"
        aria-keyshortcuts="Shift+Tab"
        title="Shift+Tab 切换 reasoning effort"
      >
        <SelectValue>Reasoning: {level}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" side="top">
        <SelectGroup>
          {levels.map((available) => (
            <SelectItem key={available} value={available}>
              Reasoning: {available}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function nextThinkingLevel(
  level: ThinkingLevel,
  levels: ThinkingLevel[]
) {
  const currentIndex = levels.indexOf(level)
  if (currentIndex === -1) {
    throw new Error(`当前 reasoning effort ${level} 不在可选档位中。`)
  }
  const next = levels[(currentIndex + 1) % levels.length]
  if (!next) throw new Error("当前模型没有可切换的 reasoning effort。")
  return next
}

"use client"

import Link from "next/link"
import type {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  ReactNode,
  Ref,
} from "react"
import { useId, useRef, useState } from "react"
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
  composerCommandItemId,
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
  imagesSupported?: boolean | null
  onImagesAdd?: (files: File[]) => void | Promise<void>
  onImageRemove?: (id: string) => void
  onCycleThinkingLevel?: () => void
  textareaRef?: Ref<HTMLTextAreaElement>
  className?: string
  commands?: ComposerCommand[]
}) {
  const imageInputRef = useRef<HTMLInputElement>(null)
  const commandMenuId = useId()
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState("")
  const [openedWithSlash, setOpenedWithSlash] = useState(false)
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null)
  const availableCommands: ComposerCommand[] = [
    ...commands,
    {
      id: imageCommandId,
      label: "图片",
      description:
        imagesSupported === false
          ? "当前模型不支持图片"
          : imagesSupported === null
            ? "添加到当前消息；发送时验证模型"
            : "添加到当前消息",
      icon: ImagePlusIcon,
      disabled: imagesSupported === false || submitting || !onImagesAdd,
      onSelect: noop,
    },
  ]
  const matchingCommands = filterComposerCommands(
    availableCommands,
    commandQuery
  )
  const enabledMatchingCommands = matchingCommands.filter(
    (command) => !command.disabled
  )
  const activeCommand =
    enabledMatchingCommands.find((command) => command.id === activeCommandId) ??
    enabledMatchingCommands[0] ??
    null
  const hasUnsupportedImages = images.length > 0 && imagesSupported === false
  const submissionDisabled =
    (!value.trim() && images.length === 0) ||
    submitting ||
    sendDisabled ||
    hasUnsupportedImages

  function closeCommandMenu() {
    setCommandMenuOpen(false)
    setCommandQuery("")
    setOpenedWithSlash(false)
    setActiveCommandId(null)
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
        event.preventDefault()
        closeCommandMenu()
        return
      }
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        event.preventDefault()
        if (enabledMatchingCommands.length === 0) return

        const currentIndex = activeCommand
          ? enabledMatchingCommands.findIndex(
              (command) => command.id === activeCommand.id
            )
          : -1
        const nextIndex =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? enabledMatchingCommands.length - 1
              : event.key === "ArrowUp"
                ? currentIndex <= 0
                  ? enabledMatchingCommands.length - 1
                  : currentIndex - 1
                : currentIndex < 0 ||
                    currentIndex === enabledMatchingCommands.length - 1
                  ? 0
                  : currentIndex + 1
        setActiveCommandId(enabledMatchingCommands[nextIndex]?.id ?? null)
        return
      }
      if (
        (event.key === "Enter" &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing) ||
        (event.key === "Tab" && !event.shiftKey)
      ) {
        if (activeCommand) {
          event.preventDefault()
          handleCommandSelect(activeCommand)
          return
        }
      }
    }
    if (
      event.key.toLowerCase() === "r" &&
      event.shiftKey &&
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      onCycleThinkingLevel
    ) {
      event.preventDefault()
      onCycleThinkingLevel()
      return
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      if (!submissionDisabled) event.currentTarget.form?.requestSubmit()
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files).filter((file) =>
      file.type.startsWith("image/")
    )
    if (files.length === 0 || !onImagesAdd) return

    event.preventDefault()
    if (submitting) {
      toast.error("消息正在发送，请稍后添加图片。")
      return
    }
    if (imagesSupported === false) {
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
                    setActiveCommandId(null)
                  }
                }}
                commands={availableCommands}
                query={commandQuery}
                menuId={commandMenuId}
                activeCommandId={activeCommand?.id ?? null}
                preserveInputFocus={openedWithSlash}
                onTriggerClick={() => {
                  setCommandQuery("")
                  setOpenedWithSlash(false)
                  setActiveCommandId(null)
                }}
                onActiveCommandChange={setActiveCommandId}
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
                  if (!files.length) return
                  if (submitting) {
                    toast.error("消息正在发送，请稍后添加图片。")
                    return
                  }
                  if (imagesSupported === false) {
                    toast.error("当前模型不支持图片。")
                    return
                  }
                  void onImagesAdd?.(files)
                }}
              />
            </>
          ) : null}
          {settings}
        </div>
      ) : null}
      <ComposerImagePreviews
        images={images}
        error={
          imageError ??
          (hasUnsupportedImages
            ? "当前模型不支持已添加的图片。请移除图片或切换模型。"
            : null)
        }
        onRemove={onImageRemove}
        disabled={submitting}
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
          aria-controls={
            openedWithSlash && commandMenuOpen ? commandMenuId : undefined
          }
          aria-expanded={openedWithSlash && commandMenuOpen ? true : undefined}
          aria-haspopup={
            openedWithSlash && commandMenuOpen ? "menu" : undefined
          }
          aria-activedescendant={
            openedWithSlash && commandMenuOpen && activeCommand
              ? composerCommandItemId(commandMenuId, activeCommand.id)
              : undefined
          }
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
              disabled={submissionDisabled}
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
    if (disabled) {
      return (
        <Button size="sm" variant="outline" disabled>
          <Settings2Icon />
          选择模型
        </Button>
      )
    }
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
        aria-keyshortcuts="Alt+Shift+R"
        title="Alt+Shift+R 切换 reasoning effort"
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

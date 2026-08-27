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
  Minimize2Icon,
  Settings2Icon,
  TargetIcon,
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
import { useI18n } from "@/components/i18n-provider"
import {
  useKeyboardShortcuts,
  useShortcutAction,
} from "@/components/keyboard-shortcuts-provider"
import type { Translator } from "@/lib/i18n"

function modelValue(model: { provider: string; id: string }) {
  return JSON.stringify([model.provider, model.id])
}

const imageCommandId = "image"

function noop() {}

export function ConversationComposer({
  value,
  onValueChange,
  onSubmit,
  placeholder,
  ariaLabel,
  autoFocus = false,
  submitting = false,
  sendDisabled = false,
  editor,
  actions,
  endActions,
  settings,
  sessionControls,
  images = [],
  imageError,
  imagesSupported = false,
  allowImageChangesWhileSubmitting = false,
  onImagesAdd,
  onImageRemove,
  onCycleThinkingLevel,
  onDecreaseThinkingLevel,
  onIncreaseThinkingLevel,
  textareaRef,
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
  sessionControls?: {
    goal?: {
      disabled?: boolean
      onClick?: () => void
    }
    runtime: {
      active: boolean
      label: string
    }
    compact?: {
      disabled?: boolean
      pending?: boolean
      onClick?: () => void
    }
  }
  images?: ComposerImage[]
  imageError?: string | null
  imagesSupported?: boolean | null
  allowImageChangesWhileSubmitting?: boolean
  onImagesAdd?: (files: File[]) => void | Promise<void>
  onImageRemove?: (id: string) => void
  onCycleThinkingLevel?: () => void
  onDecreaseThinkingLevel?: () => void
  onIncreaseThinkingLevel?: () => void
  textareaRef?: Ref<HTMLTextAreaElement>
  commands?: ComposerCommand[]
}) {
  const { t } = useI18n()
  const resolvedPlaceholder = placeholder ?? t("composer.placeholder")
  const resolvedAriaLabel = ariaLabel ?? t("composer.ariaLabel")
  const imageInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const commandMenuId = useId()
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState("")
  const [openedWithSlash, setOpenedWithSlash] = useState(false)
  const [activeCommandId, setActiveCommandId] = useState<string | null>(null)
  const imageChangesDisabled = submitting && !allowImageChangesWhileSubmitting
  const availableCommands: ComposerCommand[] = [
    ...commands,
    {
      id: imageCommandId,
      label: t("composer.image.label"),
      description:
        imagesSupported === false
          ? t("composer.image.unsupported")
          : imagesSupported === null
            ? t("composer.image.addPendingValidation")
            : t("composer.image.add"),
      icon: ImagePlusIcon,
      disabled:
        imagesSupported === false || imageChangesDisabled || !onImagesAdd,
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
    if (imageChangesDisabled) {
      toast.error(t("composer.image.sending"))
      return
    }
    if (imagesSupported === false) {
      toast.error(t("composer.image.unsupportedSentence"))
      return
    }
    void onImagesAdd(files)
  }

  function composerHasFocus() {
    return (
      document.activeElement instanceof Element &&
      formRef.current?.contains(document.activeElement) === true
    )
  }

  useShortcutAction(
    "composer.attachPhoto",
    () => {
      imageInputRef.current?.click()
      return imageInputRef.current !== null
    },
    imagesSupported !== false && !imageChangesDisabled && !!onImagesAdd
  )
  useShortcutAction(
    "composer.cycleReasoning",
    () => {
      if (!composerHasFocus()) return false
      onCycleThinkingLevel?.()
    },
    !!onCycleThinkingLevel
  )
  useShortcutAction(
    "composer.decreaseReasoning",
    () => {
      if (!composerHasFocus()) return false
      onDecreaseThinkingLevel?.()
    },
    !!onDecreaseThinkingLevel
  )
  useShortcutAction(
    "composer.increaseReasoning",
    () => {
      if (!composerHasFocus()) return false
      onIncreaseThinkingLevel?.()
    },
    !!onIncreaseThinkingLevel
  )
  useShortcutAction("composer.openModelSelector", () => {
    const trigger = formRef.current?.querySelector<HTMLButtonElement>(
      "[data-shortcut-model-selector]"
    )
    if (!trigger || trigger.disabled) return false
    trigger.click()
  })
  useShortcutAction("composer.send", () => {
    if (!formRef.current || submissionDisabled) return false
    formRef.current.requestSubmit()
  })
  useShortcutAction("composer.openCommandMenu", () => {
    const input = formRef.current?.querySelector<HTMLTextAreaElement>(
      "[data-composer-input]"
    )
    if (!input) return false
    input.focus()
    setCommandQuery("")
    setOpenedWithSlash(true)
    setActiveCommandId(null)
    setCommandMenuOpen(true)
  })

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="rounded-2xl border bg-card p-2 shadow-sm"
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
                  if (imageChangesDisabled) {
                    toast.error(t("composer.image.sending"))
                    return
                  }
                  if (imagesSupported === false) {
                    toast.error(t("composer.image.unsupportedSentence"))
                    return
                  }
                  void onImagesAdd?.(files)
                }}
              />
            </>
          ) : null}
          {settings}
          {sessionControls?.compact ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={sessionControls.compact.onClick}
              disabled={sessionControls.compact.disabled}
            >
              {sessionControls.compact.pending ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <Minimize2Icon />
              )}
              {t("session.runtime.compactContext")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <ComposerImagePreviews
        images={images}
        error={
          imageError ??
          (hasUnsupportedImages
            ? t("composer.image.unsupportedAttached")
            : null)
        }
        onRemove={onImageRemove}
        disabled={imageChangesDisabled}
      />
      {editor ?? (
        <Textarea
          ref={textareaRef}
          data-composer-input
          value={value}
          onChange={(event) => handleValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={resolvedPlaceholder}
          aria-label={resolvedAriaLabel}
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
        {sessionControls?.goal ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={sessionControls.goal.onClick}
            disabled={sessionControls.goal.disabled}
          >
            <TargetIcon />
            {t("session.command.goal")}
          </Button>
        ) : null}
        {sessionControls ? (
          <span
            role="status"
            aria-label={sessionControls.runtime.label}
            title={sessionControls.runtime.label}
            className={`size-2 shrink-0 rounded-full ${
              sessionControls.runtime.active ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
        ) : null}
        {actions}
        <div className="ml-auto flex items-center gap-2">
          {endActions}
          {editor === undefined ? (
            <Button
              type="submit"
              size="icon"
              className="rounded-full"
              disabled={submissionDisabled}
              aria-label={t("composer.send")}
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
  const { t } = useI18n()
  const selected = model
    ? models.find((available) => modelValue(available) === modelValue(model))
    : null

  if (!selected) {
    if (disabled) {
      return (
        <Button size="sm" variant="outline" disabled>
          <Settings2Icon />
          {t("composer.model.select")}
        </Button>
      )
    }
    return (
      <Button asChild size="sm" variant="outline">
        <Link href={settingsHref}>
          <Settings2Icon />
          {t("composer.model.select")}
        </Link>
      </Button>
    )
  }

  return (
    <Select
      value={modelValue(selected)}
      onValueChange={(value) => {
        const next = models.find((available) => modelValue(available) === value)
        if (!next) throw new Error(t("composer.model.unavailable"))
        onModelChange(next)
      }}
      disabled={disabled}
    >
      <SelectTrigger
        data-shortcut-model-selector
        size="sm"
        className="max-w-56"
        aria-label={t("composer.model.ariaLabel")}
      >
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
              {t("composer.model.manage")}
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
  const { t } = useI18n()
  const { ariaBindings, formattedBindings } = useKeyboardShortcuts()
  const cycleShortcut = formattedBindings("composer.cycleReasoning")[0]
  if (levels.length === 0) return null

  return (
    <Select
      value={level}
      onValueChange={(value) => {
        const next = levels.find((available) => available === value)
        if (!next) throw new Error(t("composer.reasoningUnavailable"))
        onLevelChange(next)
      }}
      disabled={disabled || levels.length < 2}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("composer.reasoningEffort")}
        aria-keyshortcuts={ariaBindings("composer.cycleReasoning") || undefined}
        title={
          cycleShortcut
            ? t("composer.reasoningShortcut", { shortcut: cycleShortcut })
            : undefined
        }
      >
        <SelectValue>{t("composer.reasoningLevel", { level })}</SelectValue>
      </SelectTrigger>
      <SelectContent position="popper" side="top">
        <SelectGroup>
          {levels.map((available) => (
            <SelectItem key={available} value={available}>
              {t("composer.reasoningLevel", { level: available })}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function nextThinkingLevel(
  level: ThinkingLevel,
  levels: ThinkingLevel[],
  t: Translator
) {
  const currentIndex = levels.indexOf(level)
  if (currentIndex === -1) {
    throw new Error(t("composer.reasoningInvalid", { level }))
  }
  const next = levels[(currentIndex + 1) % levels.length]
  if (!next) throw new Error(t("composer.reasoningNoAlternative"))
  return next
}

export function adjacentThinkingLevel(
  level: ThinkingLevel,
  levels: ThinkingLevel[],
  direction: -1 | 1,
  t: Translator
) {
  const currentIndex = levels.indexOf(level)
  if (currentIndex === -1) {
    throw new Error(t("composer.reasoningInvalid", { level }))
  }
  return levels[
    Math.min(levels.length - 1, Math.max(0, currentIndex + direction))
  ]!
}

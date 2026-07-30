"use client"

import { PlusIcon, type LucideIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

export interface ComposerCommand {
  id: string
  label: string
  description: string
  icon: LucideIcon
  disabled?: boolean
  onSelect: () => void
}

const slashCommandPattern = /(?:^|\s)\/([^\s/]*)$/

export function composerSlashCommandQuery(value: string) {
  return slashCommandPattern.exec(value)?.[1]?.toLowerCase() ?? null
}

export function removeComposerSlashCommand(value: string) {
  const match = slashCommandPattern.exec(value)
  return match ? value.slice(0, match.index).trimEnd() : value
}

export function composerCommandItemId(menuId: string, commandId: string) {
  return `${menuId}-command-${encodeURIComponent(commandId)}`
}

export function filterComposerCommands(
  commands: ComposerCommand[],
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return commands

  return commands
    .map((command, index) => {
      const terms = [command.id, command.label, command.description].map(
        (value) => value.toLowerCase()
      )
      const prefix = terms.some((term) => term.startsWith(normalizedQuery))
      const included = terms.some((term) => term.includes(normalizedQuery))
      return { command, included, index, priority: prefix ? 0 : 1 }
    })
    .filter((result) => result.included)
    .sort(
      (left, right) =>
        left.priority - right.priority || left.index - right.index
    )
    .map((result) => result.command)
}

export function ComposerCommandMenu({
  open,
  onOpenChange,
  commands,
  query,
  menuId,
  activeCommandId,
  preserveInputFocus,
  onTriggerClick,
  onActiveCommandChange,
  onCommandSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: ComposerCommand[]
  query: string
  menuId: string
  activeCommandId: string | null
  preserveInputFocus: boolean
  onTriggerClick: () => void
  onActiveCommandChange: (commandId: string) => void
  onCommandSelect: (command: ComposerCommand) => void
}) {
  const visibleCommands = filterComposerCommands(commands, query)
  const enabledCommands = visibleCommands.filter((command) => !command.disabled)

  function moveCommandFocus(
    event: React.KeyboardEvent<HTMLButtonElement>,
    commandId: string
  ) {
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return
    }

    event.preventDefault()
    if (enabledCommands.length === 0) return
    const currentIndex = enabledCommands.findIndex(
      (command) => command.id === commandId
    )
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? enabledCommands.length - 1
          : event.key === "ArrowUp"
            ? currentIndex <= 0
              ? enabledCommands.length - 1
              : currentIndex - 1
            : currentIndex < 0 || currentIndex === enabledCommands.length - 1
              ? 0
              : currentIndex + 1
    const nextCommand = enabledCommands[nextIndex]
    if (!nextCommand) return
    onActiveCommandChange(nextCommand.id)
    document
      .getElementById(composerCommandItemId(menuId, nextCommand.id))
      ?.focus()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <Button
          data-liquid-glass="control"
          type="button"
          variant="secondary"
          size="icon"
          className="rounded-full"
          aria-label="命令"
          onClick={onTriggerClick}
        >
          <PlusIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-[min(26rem,calc(100vw-2rem))] p-1"
        onOpenAutoFocus={(event) => {
          if (preserveInputFocus) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          if (preserveInputFocus) event.preventDefault()
        }}
      >
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          命令
        </p>
        <div id={menuId} role="menu" aria-label="命令" className="grid gap-0.5">
          {visibleCommands.map((command) => {
            const Icon = command.icon
            const active = command.id === activeCommandId
            return (
              <Button
                key={command.id}
                id={composerCommandItemId(menuId, command.id)}
                role="menuitem"
                type="button"
                variant="ghost"
                disabled={command.disabled}
                onClick={() => onCommandSelect(command)}
                onFocus={() => onActiveCommandChange(command.id)}
                onKeyDown={(event) => moveCommandFocus(event, command.id)}
                aria-current={active ? "true" : undefined}
                data-active={active || undefined}
                className={cn(
                  "h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left font-normal",
                  "hover:bg-accent hover:text-accent-foreground",
                  "data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                )}
              >
                <Icon />
                <span className="grid min-w-0 gap-0.5">
                  <span>{command.label}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {command.description}
                  </span>
                </span>
              </Button>
            )
          })}
          {visibleCommands.length === 0 ? (
            <p
              role="status"
              className="px-2 py-3 text-sm text-muted-foreground"
            >
              没有匹配的命令
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

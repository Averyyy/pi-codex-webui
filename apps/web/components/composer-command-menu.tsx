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
  preserveInputFocus,
  onTriggerClick,
  onCommandSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  commands: ComposerCommand[]
  query: string
  preserveInputFocus: boolean
  onTriggerClick: () => void
  onCommandSelect: (command: ComposerCommand) => void
}) {
  const visibleCommands = filterComposerCommands(commands, query)

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
        <div role="listbox" aria-label="命令" className="grid gap-0.5">
          {visibleCommands.map((command) => {
            const Icon = command.icon
            return (
              <Button
                key={command.id}
                type="button"
                variant="ghost"
                disabled={command.disabled}
                onClick={() => onCommandSelect(command)}
                className={cn(
                  "h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left font-normal",
                  "hover:bg-accent hover:text-accent-foreground"
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

"use client"

import { useEffect, useMemo, useState } from "react"
import { KeyboardIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"

import { useKeyboardShortcuts } from "@/components/keyboard-shortcuts-provider"
import { useI18n } from "@/components/i18n-provider"
import {
  findShortcutConflict,
  formatShortcut,
  shortcutCategories,
  shortcutCommands,
  shortcutFromKeyboardEvent,
  type ShortcutCommandId,
} from "@/lib/keyboard-shortcuts"

export function KeyboardShortcutSettings() {
  const { t } = useI18n()
  const { platform, overrides, bindings, setBindings, resetCommand, resetAll } =
    useKeyboardShortcuts()
  const [query, setQuery] = useState("")
  const [recording, setRecording] = useState<ShortcutCommandId | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!recording) return

    function capture(event: KeyboardEvent) {
      event.preventDefault()
      event.stopPropagation()
      if (event.code === "Escape") {
        setRecording(null)
        setError(null)
        return
      }
      if (
        (event.code === "Backspace" || event.code === "Delete") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        setBindings(recording!, [])
        setRecording(null)
        setError(null)
        return
      }

      const binding = shortcutFromKeyboardEvent(event, platform)
      if (!binding) {
        setError(t("shortcuts.record.invalid"))
        return
      }
      const conflict = findShortcutConflict(
        overrides,
        binding,
        recording!,
        platform
      )
      if (conflict) {
        setError(
          t("shortcuts.record.conflict", {
            command: t(conflict.labelKey),
          })
        )
        return
      }
      const current = bindings(recording!)
      if (!current.includes(binding)) {
        setBindings(recording!, [...current, binding])
      }
      setRecording(null)
      setError(null)
    }

    window.addEventListener("keydown", capture, true)
    return () => window.removeEventListener("keydown", capture, true)
  }, [bindings, overrides, platform, recording, setBindings, t])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = useMemo(
    () =>
      shortcutCommands.filter((command) => {
        if (!normalizedQuery) return true
        return [t(command.labelKey), t(command.descriptionKey)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      }),
    [normalizedQuery, t]
  )

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t("shortcuts.search.label")}
          placeholder={t("shortcuts.search.placeholder")}
          className="sm:max-w-sm"
        />
        <Button
          type="button"
          variant="outline"
          className="sm:ml-auto"
          onClick={() => {
            resetAll()
            setRecording(null)
            setError(null)
          }}
          disabled={Object.keys(overrides).length === 0}
        >
          <RotateCcwIcon />
          {t("shortcuts.resetAll")}
        </Button>
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        {t("shortcuts.browserNotice")}
      </p>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {shortcutCategories.map((category) => {
        const commands = filtered.filter(
          (command) => command.category === category
        )
        if (!commands.length) return null
        return (
          <Card key={category}>
            <CardHeader className="border-b">
              <CardTitle>{t(`shortcuts.category.${category}`)}</CardTitle>
              <CardDescription>
                {t(`shortcuts.category.${category}.description`)}
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {commands.map((command) => {
                const commandBindings = bindings(command.id)
                const isRecording = recording === command.id
                return (
                  <div
                    key={command.id}
                    className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(12rem,1fr)_minmax(16rem,auto)] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{t(command.labelKey)}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {t(command.descriptionKey)}
                      </p>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-end">
                      {commandBindings.length ? (
                        commandBindings.map((binding) => (
                          <span
                            key={binding}
                            className="inline-flex h-8 items-center rounded-lg border bg-muted/40 pl-2.5 text-xs font-medium"
                          >
                            <kbd>{formatShortcut(binding, platform)}</kbd>
                            <button
                              type="button"
                              className="ml-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              aria-label={t("shortcuts.remove", {
                                shortcut: formatShortcut(binding, platform),
                                command: t(command.labelKey),
                              })}
                              onClick={() => {
                                setBindings(
                                  command.id,
                                  commandBindings.filter(
                                    (candidate) => candidate !== binding
                                  )
                                )
                                setError(null)
                              }}
                            >
                              <XIcon className="size-3.5" />
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("shortcuts.unassigned")}
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant={isRecording ? "secondary" : "outline"}
                        data-shortcut-recorder={isRecording ? "" : undefined}
                        aria-pressed={isRecording}
                        onClick={() => {
                          setRecording(isRecording ? null : command.id)
                          setError(null)
                        }}
                      >
                        {isRecording ? <KeyboardIcon /> : <PlusIcon />}
                        {isRecording
                          ? t("shortcuts.recording")
                          : t("shortcuts.add")}
                      </Button>
                      {overrides[command.id] !== undefined ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={t("shortcuts.resetCommand", {
                            command: t(command.labelKey),
                          })}
                          onClick={() => {
                            resetCommand(command.id)
                            if (recording === command.id) setRecording(null)
                            setError(null)
                          }}
                        >
                          <RotateCcwIcon />
                          {t("shortcuts.reset")}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("shortcuts.search.empty")}
        </div>
      ) : null}
    </div>
  )
}

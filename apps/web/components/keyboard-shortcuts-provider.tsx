"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"

import { useI18n } from "@/components/i18n-provider"
import {
  effectiveShortcutBindings,
  formatShortcut,
  normalizeShortcutOverrides,
  shortcutAriaLabel,
  shortcutCommands,
  shortcutMatchesEvent,
  shortcutOverridesEqual,
  type ShortcutCommandId,
  type ShortcutOverrides,
} from "@/lib/keyboard-shortcuts"
import { isWorkspaceNavItemVisible } from "@/lib/workspace-nav-focus"
import { pickWorkspaceProject } from "@/lib/project-picker-client"

const STORAGE_KEY = "pi-web-codex.keyboard-shortcuts.v1"
export const SHORTCUT_ACTION_EVENT = "pi-web-codex:shortcut-action"

interface StoredShortcuts {
  version: 1
  bindings: ShortcutOverrides
}

interface ShortcutContextValue {
  platform: string
  overrides: ShortcutOverrides
  bindings: (commandId: ShortcutCommandId) => readonly string[]
  formattedBindings: (commandId: ShortcutCommandId) => string[]
  ariaBindings: (commandId: ShortcutCommandId) => string
  setBindings: (commandId: ShortcutCommandId, bindings: string[]) => void
  resetCommand: (commandId: ShortcutCommandId) => void
  resetAll: () => void
}

interface ShortcutActionDetail {
  commandId: ShortcutCommandId
}

const ShortcutContext = createContext<ShortcutContextValue | null>(null)

function parseStoredShortcuts(value: string | null) {
  if (!value) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    if (error instanceof SyntaxError) return {}
    throw error
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    parsed.version !== 1 ||
    !("bindings" in parsed)
  ) {
    return {}
  }
  return normalizeShortcutOverrides(parsed.bindings)
}

function persistShortcuts(overrides: ShortcutOverrides) {
  const stored: StoredShortcuts = { version: 1, bindings: overrides }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

function conversationLinks() {
  return Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      "a[data-conversation-shortcut]"
    )
  ).filter(isWorkspaceNavItemVisible)
}

function currentProjectId(pathname: string) {
  const match = /^\/projects\/([^/]+)/.exec(pathname)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function dataValue(name: string) {
  return (
    document
      .querySelector<HTMLElement>(`[data-${name}]`)
      ?.getAttribute(`data-${name}`) ?? undefined
  )
}

export function KeyboardShortcutsProvider({
  platform,
  mutationToken,
  children,
}: {
  platform: string
  mutationToken: string
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useI18n()
  const [overrides, setOverrides] = useState<ShortcutOverrides>({})
  const overridesRef = useRef<ShortcutOverrides>({})
  const pickingProjectRef = useRef(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const next = parseStoredShortcuts(
        window.localStorage.getItem(STORAGE_KEY)
      )
      overridesRef.current = next
      setOverrides(next)
    })

    function syncFromStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      const next = parseStoredShortcuts(event.newValue)
      if (shortcutOverridesEqual(overridesRef.current, next)) return
      overridesRef.current = next
      setOverrides(next)
    }

    window.addEventListener("storage", syncFromStorage)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("storage", syncFromStorage)
    }
  }, [])

  const bindings = useCallback(
    (commandId: ShortcutCommandId) =>
      effectiveShortcutBindings(overrides, commandId),
    [overrides]
  )

  const formattedBindings = useCallback(
    (commandId: ShortcutCommandId) =>
      bindings(commandId).map((binding) => formatShortcut(binding, platform)),
    [bindings, platform]
  )

  const ariaBindings = useCallback(
    (commandId: ShortcutCommandId) =>
      bindings(commandId)
        .map((binding) => shortcutAriaLabel(binding, platform))
        .join(" "),
    [bindings, platform]
  )

  const updateOverrides = useCallback(
    (update: (current: ShortcutOverrides) => ShortcutOverrides) => {
      const next = update(overridesRef.current)
      overridesRef.current = next
      persistShortcuts(next)
      setOverrides(next)
    },
    []
  )

  const setBindings = useCallback(
    (commandId: ShortcutCommandId, nextBindings: string[]) => {
      updateOverrides((current) => ({
        ...current,
        [commandId]: [...nextBindings],
      }))
    },
    [updateOverrides]
  )

  const resetCommand = useCallback(
    (commandId: ShortcutCommandId) => {
      updateOverrides((current) => {
        const next = { ...current }
        delete next[commandId]
        return next
      })
    },
    [updateOverrides]
  )

  const resetAll = useCallback(() => {
    overridesRef.current = {}
    persistShortcuts({})
    setOverrides({})
  }, [])

  const copy = useCallback(
    (value: string | undefined, successMessage: string) => {
      if (!value) return false
      void navigator.clipboard.writeText(value).then(
        () => toast.success(successMessage),
        (error: unknown) =>
          toast.error(error instanceof Error ? error.message : String(error))
      )
      return true
    },
    []
  )

  const executeGlobal = useCallback(
    (commandId: ShortcutCommandId) => {
      if (commandId === "conversation.new") {
        const projectId = currentProjectId(pathname)
        router.push(
          projectId ? `/new?projectId=${encodeURIComponent(projectId)}` : "/new"
        )
        return true
      }
      if (commandId === "conversation.newIndependent") {
        router.push("/new")
        return true
      }
      if (
        commandId === "conversation.archive" ||
        commandId === "conversation.togglePin"
      ) {
        const activeLink = document.querySelector<HTMLAnchorElement>(
          'a[data-conversation-shortcut][aria-current="page"]'
        )
        const action = activeLink
          ?.closest("li")
          ?.querySelector<HTMLButtonElement>(
            commandId === "conversation.archive"
              ? "button[data-session-archive]"
              : "button[data-session-pin]"
          )
        if (!action || action.getAttribute("aria-busy") === "true") return false
        action.click()
        return true
      }
      if (commandId === "navigation.back") {
        router.back()
        return true
      }
      if (commandId === "navigation.forward") {
        router.forward()
        return true
      }
      if (commandId === "navigation.switchConversation") {
        router.push("/search")
        return true
      }
      if (commandId === "settings.open") {
        router.push("/settings/general")
        return true
      }
      if (commandId === "settings.shortcuts") {
        router.push("/settings/shortcuts")
        return true
      }
      if (commandId === "settings.skills") {
        router.push("/settings/skills")
        return true
      }
      if (commandId === "settings.mcp") {
        router.push("/settings/mcp")
        return true
      }
      if (commandId === "workspace.openFolder") {
        if (pickingProjectRef.current) return true
        pickingProjectRef.current = true
        void pickWorkspaceProject(mutationToken)
          .then((project) => {
            if (project) router.refresh()
          })
          .catch((error: unknown) =>
            toast.error(error instanceof Error ? error.message : String(error))
          )
          .finally(() => {
            pickingProjectRef.current = false
          })
        return true
      }
      if (commandId === "conversation.copyDeepLink") {
        return copy(window.location.href, t("shortcuts.copied.deepLink"))
      }
      if (commandId === "conversation.copyPath") {
        return copy(
          dataValue("conversation-path"),
          t("shortcuts.copied.conversationPath")
        )
      }
      if (commandId === "conversation.copyId") {
        return copy(dataValue("conversation-id"), t("shortcuts.copied.id"))
      }
      if (commandId === "conversation.copyWorkingDirectory") {
        return copy(
          dataValue("working-directory"),
          t("shortcuts.copied.workingDirectory")
        )
      }

      const numberMatch = /^navigation\.conversation([1-9])$/.exec(commandId)
      if (numberMatch) {
        const link = conversationLinks()[Number(numberMatch[1]) - 1]
        if (!link) return false
        router.push(link.getAttribute("href")!)
        return true
      }

      if (
        commandId === "navigation.nextConversation" ||
        commandId === "navigation.previousConversation"
      ) {
        const links = conversationLinks()
        if (!links.length) return false
        const currentIndex = links.findIndex(
          (link) => new URL(link.href).pathname === pathname
        )
        const offset =
          commandId === "navigation.nextConversation" ? 1 : links.length - 1
        const nextIndex =
          currentIndex === -1 ? 0 : (currentIndex + offset) % links.length
        const href = links[nextIndex]?.getAttribute("href")
        if (!href) return false
        router.push(href)
        return true
      }

      return false
    },
    [copy, mutationToken, pathname, router, t]
  )

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.repeat ||
        event.isComposing ||
        (event.target instanceof Element &&
          event.target.closest("[data-shortcut-recorder]"))
      ) {
        return
      }

      const command = shortcutCommands.find((candidate) =>
        bindings(candidate.id).some((binding) =>
          shortcutMatchesEvent(binding, event, platform)
        )
      )
      if (!command) return

      const action = new CustomEvent<ShortcutActionDetail>(
        SHORTCUT_ACTION_EVENT,
        {
          cancelable: true,
          detail: { commandId: command.id },
        }
      )
      const locallyHandled = !window.dispatchEvent(action)
      const globallyHandled = locallyHandled ? false : executeGlobal(command.id)
      if (locallyHandled || globallyHandled) event.preventDefault()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [bindings, executeGlobal, platform])

  const value = useMemo<ShortcutContextValue>(
    () => ({
      platform,
      overrides,
      bindings,
      formattedBindings,
      ariaBindings,
      setBindings,
      resetCommand,
      resetAll,
    }),
    [
      ariaBindings,
      bindings,
      formattedBindings,
      overrides,
      platform,
      resetAll,
      resetCommand,
      setBindings,
    ]
  )

  return (
    <ShortcutContext.Provider value={value}>
      {children}
    </ShortcutContext.Provider>
  )
}

export function useKeyboardShortcuts() {
  const context = useContext(ShortcutContext)
  if (!context) {
    throw new Error(
      "useKeyboardShortcuts must be used within KeyboardShortcutsProvider."
    )
  }
  return context
}

export function useShortcutAction(
  commandId: ShortcutCommandId,
  handler: () => boolean | void,
  enabled = true
) {
  const handlerRef = useRef(handler)
  useLayoutEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    function handleAction(event: Event) {
      const action = event as CustomEvent<ShortcutActionDetail>
      if (!enabled || action.detail.commandId !== commandId) return
      if (handlerRef.current() === false) return
      action.preventDefault()
    }
    window.addEventListener(SHORTCUT_ACTION_EVENT, handleAction)
    return () => window.removeEventListener(SHORTCUT_ACTION_EVENT, handleAction)
  }, [commandId, enabled])
}

"use client"

import { useSidebar } from "@workspace/ui/components/sidebar"

import { useShortcutAction } from "@/components/keyboard-shortcuts-provider"

export function SidebarShortcut() {
  const { toggleSidebar } = useSidebar()
  useShortcutAction("workspace.toggleSidebar", () => {
    toggleSidebar(
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined
    )
  })
  return null
}

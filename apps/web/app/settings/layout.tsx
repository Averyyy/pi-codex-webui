import type { CSSProperties } from "react"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { SettingsBackButton } from "@/components/settings-back-button"
import { SettingsHeaderTitle } from "@/components/settings-header-title"
import { SettingsNav } from "@/components/settings-nav"
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "var(--app-sidebar-width)",
        } as CSSProperties
      }
    >
      <SettingsNav />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SettingsBackButton />
          <SidebarTrigger className="md:hidden" />
          <SettingsHeaderTitle />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

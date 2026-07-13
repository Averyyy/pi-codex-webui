import type { CSSProperties } from "react"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

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
        <header className="flex h-12 items-center border-b px-3 md:hidden">
          <SidebarTrigger />
          <span className="ml-2 font-medium">设置</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}

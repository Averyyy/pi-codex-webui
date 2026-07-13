import type { CSSProperties } from "react"
import { connection } from "next/server"

import "@workspace/ui/globals.css"
import "@xterm/xterm/css/xterm.css"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { ThemeProvider } from "@/components/theme-provider"
import { PwaRegistration } from "@/components/pwa-registration"
import { loadConfig } from "@/lib/config"

export const metadata = {
  title: "pi-web-codex",
  description: "Local Web Host for Pi coding-agent workflows",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await connection()
  const config = await loadConfig()

  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      style={
        {
          "--app-font-size": `${config.appearance.fontSize}px`,
          "--app-sidebar-width": `${config.appearance.sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <body>
        <ThemeProvider defaultTheme={config.appearance.theme}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
          <PwaRegistration />
        </ThemeProvider>
      </body>
    </html>
  )
}

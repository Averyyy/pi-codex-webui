import type { CSSProperties } from "react"
import { connection } from "next/server"

import "@workspace/ui/globals.css"
import "@xterm/xterm/css/xterm.css"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { ThemeProvider } from "@/components/theme-provider"
import { I18nProvider } from "@/components/i18n-provider"
import { PwaRegistration } from "@/components/pwa-registration"
import { getLocalizedConfig } from "@/lib/i18n-server"

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
  const { config } = await getLocalizedConfig()

  return (
    <html
      lang={config.appearance.language}
      suppressHydrationWarning
      style={
        {
          "--app-font-size": `${config.appearance.fontSize}px`,
          "--app-sidebar-width": `${config.appearance.sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <body>
        <I18nProvider initialLocale={config.appearance.language}>
          <ThemeProvider defaultTheme={config.appearance.theme}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
            <PwaRegistration />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  )
}

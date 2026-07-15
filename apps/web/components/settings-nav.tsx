"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArchiveIcon,
  BlocksIcon,
  Code2Icon,
  CableIcon,
  PackageIcon,
  PaletteIcon,
  Settings2Icon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

import { useI18n } from "@/components/i18n-provider"

const sections = [
  {
    href: "/settings/general",
    key: "settings.nav.general",
    icon: Settings2Icon,
  },
  {
    href: "/settings/appearance",
    key: "settings.nav.appearance",
    icon: PaletteIcon,
  },
  { href: "/settings/archive", key: "settings.nav.archive", icon: ArchiveIcon },
  {
    href: "/settings/models",
    key: "settings.nav.models",
    icon: SlidersHorizontalIcon,
  },
  {
    href: "/settings/packages",
    key: "settings.nav.packages",
    icon: PackageIcon,
  },
  {
    href: "/settings/extensions",
    key: "settings.nav.extensions",
    icon: BlocksIcon,
  },
  {
    href: "/settings/webui-extensions",
    key: "settings.nav.webuiExtensions",
    icon: BlocksIcon,
  },
  { href: "/settings/skills", key: "settings.nav.skills", icon: SparklesIcon },
  { href: "/settings/mcp", key: "settings.nav.mcp", icon: CableIcon },
  {
    href: "/settings/developer",
    key: "settings.nav.developer",
    icon: Code2Icon,
  },
] as const

export function SettingsNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { t } = useI18n()

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex h-10 items-center px-2 text-base font-semibold">
          pi-web-codex
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("settings.label")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map(({ href, key, icon: Icon }) => {
                const label = t(key)
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === href}
                      tooltip={label}
                    >
                      <Link href={href} replace>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive tooltip={t("settings.label")}>
              <button type="button" onClick={() => router.back()}>
                <SettingsIcon />
                <span>{t("settings.label")}</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArrowLeftIcon,
  ArchiveIcon,
  BlocksIcon,
  Code2Icon,
  CableIcon,
  KeyboardIcon,
  PaletteIcon,
  Settings2Icon,
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
  useSidebar,
} from "@workspace/ui/components/sidebar"

import { useI18n } from "@/components/i18n-provider"
import { PiBrand } from "@/components/pi-brand"

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
  {
    href: "/settings/shortcuts",
    key: "settings.nav.shortcuts",
    icon: KeyboardIcon,
  },
  { href: "/settings/archive", key: "settings.nav.archive", icon: ArchiveIcon },
  {
    href: "/settings/models",
    key: "settings.nav.models",
    icon: SlidersHorizontalIcon,
  },
  {
    href: "/settings/extensions",
    key: "settings.nav.extensions",
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
  const { isMobile, setOpenMobile, state } = useSidebar()
  const navigationHidden = !isMobile && state === "collapsed"

  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [isMobile, pathname, setOpenMobile])

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader inert={navigationHidden} aria-hidden={navigationHidden}>
        <div className="flex h-10 items-center px-2">
          <PiBrand />
        </div>
      </SidebarHeader>
      <SidebarContent
        role="navigation"
        aria-label={t("settings.nav.ariaLabel")}
        inert={navigationHidden}
        aria-hidden={navigationHidden}
      >
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
                      <Link
                        href={href}
                        replace
                        aria-current={pathname === href ? "page" : undefined}
                      >
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
      <SidebarFooter inert={navigationHidden} aria-hidden={navigationHidden}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={t("settings.back")}>
              <button
                type="button"
                aria-label={t("settings.back")}
                onClick={() => router.back()}
              >
                <ArrowLeftIcon />
                <span>{t("settings.back")}</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BlocksIcon,
  Code2Icon,
  PackageIcon,
  PaletteIcon,
  Settings2Icon,
  SettingsIcon,
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

const sections = [
  { href: "/settings/general", label: "常规", icon: Settings2Icon },
  { href: "/settings/appearance", label: "外观", icon: PaletteIcon },
  { href: "/settings/packages", label: "Packages", icon: PackageIcon },
  { href: "/settings/extensions", label: "Extensions", icon: BlocksIcon },
  { href: "/settings/skills", label: "Skills", icon: SparklesIcon },
  { href: "/settings/developer", label: "Developer", icon: Code2Icon },
]

export function SettingsNav() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <div className="flex h-10 items-center px-2 text-base font-semibold">
          pi-web-codex
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>设置</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    tooltip={label}
                  >
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive tooltip="设置">
              <Link href="/settings/general">
                <SettingsIcon />
                <span>设置</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { useSidebar } from "@workspace/ui/components/sidebar"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"

import {
  themeSchema,
  type AppConfig,
  type ConfigPatch,
} from "@/lib/config-schema"

async function persistSettings(
  config: AppConfig,
  mutationToken: string,
  patch: ConfigPatch
) {
  const response = await fetch("/api/v1/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": `"revision-${config.revision}"`,
      "X-Pi-Web-Codex-Mutation-Token": mutationToken,
    },
    body: JSON.stringify(patch),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error ?? "保存失败。")
  }
  return result as AppConfig
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "保存中…" : "保存"}
    </Button>
  )
}

export function GeneralSettingsForm({
  initial,
  mutationToken,
}: {
  initial: AppConfig
  mutationToken: string
}) {
  const [config, setConfig] = useState(initial)
  const [openBrowser, setOpenBrowser] = useState(initial.server.openBrowser)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const saved = await persistSettings(config, mutationToken, {
          server: {
            port: Number(formData.get("port")),
            openBrowser,
          },
        })
        setConfig(saved)
        router.refresh()
        toast.success("常规设置已保存。")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败。")
      }
    })
  }

  return (
    <form action={submit}>
      <Card>
        <CardHeader>
          <CardTitle>本地服务</CardTitle>
          <CardDescription>
            服务只绑定本机；端口设置在重启后生效。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="host">主机</FieldLabel>
                <FieldDescription>
                  未启用认证时固定为本机回环地址。
                </FieldDescription>
              </FieldContent>
              <Input
                id="host"
                value={config.server.host}
                disabled
                className="w-48"
              />
            </Field>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="port">端口</FieldLabel>
                <FieldDescription>
                  启动命令与健康检查共用此端口。
                </FieldDescription>
              </FieldContent>
              <Input
                id="port"
                name="port"
                type="number"
                min={1}
                max={65535}
                required
                defaultValue={config.server.port}
                className="w-32"
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>启动后打开浏览器</FieldTitle>
                <FieldDescription>
                  CLI 确认健康检查通过后打开页面。
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={openBrowser}
                onCheckedChange={setOpenBrowser}
                aria-label="启动后打开浏览器"
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} />
        </CardFooter>
      </Card>
    </form>
  )
}

export function AppearanceSettingsForm({
  initial,
  mutationToken,
}: {
  initial: AppConfig
  mutationToken: string
}) {
  const [config, setConfig] = useState(initial)
  const [theme, setThemeValue] = useState(initial.appearance.theme)
  const [pending, startTransition] = useTransition()
  const { setTheme } = useTheme()
  const { setSidebarWidth } = useSidebar()
  const router = useRouter()

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const saved = await persistSettings(config, mutationToken, {
          appearance: {
            theme,
            fontSize: Number(formData.get("fontSize")),
            sidebarWidth: Number(formData.get("sidebarWidth")),
          },
        })
        setConfig(saved)
        setTheme(saved.appearance.theme)
        document.documentElement.style.setProperty(
          "--app-font-size",
          `${saved.appearance.fontSize}px`
        )
        document.documentElement.style.setProperty(
          "--app-sidebar-width",
          `${saved.appearance.sidebarWidth}px`
        )
        setSidebarWidth(saved.appearance.sidebarWidth)
        router.refresh()
        toast.success("外观设置已保存。")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "保存失败。")
      }
    })
  }

  return (
    <form action={submit}>
      <Card>
        <CardHeader>
          <CardTitle>界面</CardTitle>
          <CardDescription>这些设置会写入本机配置并立即应用。</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="theme">主题</FieldLabel>
                <FieldDescription>跟随系统、浅色或深色。</FieldDescription>
              </FieldContent>
              <Select
                value={theme}
                onValueChange={(value) =>
                  setThemeValue(themeSchema.parse(value))
                }
              >
                <SelectTrigger id="theme" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="system">系统</SelectItem>
                    <SelectItem value="light">浅色</SelectItem>
                    <SelectItem value="dark">深色</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="fontSize">字号</FieldLabel>
                <FieldDescription>
                  界面基础字号，范围 12–18px。
                </FieldDescription>
              </FieldContent>
              <Input
                id="fontSize"
                name="fontSize"
                type="number"
                min={12}
                max={18}
                required
                defaultValue={config.appearance.fontSize}
                className="w-32"
              />
            </Field>
            <Field orientation="responsive">
              <FieldContent>
                <FieldLabel htmlFor="sidebarWidth">侧边栏宽度</FieldLabel>
                <FieldDescription>
                  桌面侧边栏宽度，范围 240–360px。
                </FieldDescription>
              </FieldContent>
              <Input
                id="sidebarWidth"
                name="sidebarWidth"
                type="number"
                min={240}
                max={360}
                required
                defaultValue={config.appearance.sidebarWidth}
                className="w-32"
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <SaveButton pending={pending} />
        </CardFooter>
      </Card>
    </form>
  )
}

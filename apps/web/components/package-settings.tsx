"use client"

import { useState, type FormEvent } from "react"
import {
  LoaderCircleIcon,
  PackagePlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import type { ResourceCatalog } from "@workspace/runtime-protocol"

import {
  ResourceProjectControls,
  type ResourceProject,
} from "@/components/resource-project-controls"
import { useResourceCatalog } from "@/lib/use-resource-catalog"

export function PackageSettings({
  projects,
  projectId,
  sessionIds,
  initialCatalog,
  mutationToken,
}: {
  projects: ResourceProject[]
  projectId: string
  sessionIds: string[]
  initialCatalog: ResourceCatalog
  mutationToken: string
}) {
  const [source, setSource] = useState("")
  const [scope, setScope] = useState<"global" | "project">("global")
  const [working, setWorking] = useState<string | null>(null)
  const [trustWorking, setTrustWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [catalog, setCatalog] = useResourceCatalog(
    projectId,
    sessionIds,
    initialCatalog,
    setError
  )

  async function readCatalog(response: Response) {
    const result = (await response.json()) as ResourceCatalog & {
      error?: string
    }
    if (!response.ok) throw new Error(result.error ?? "Pi package 操作失败。")
    setCatalog(result)
  }

  async function install(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!source.trim()) return
    setWorking("install")
    setError(null)
    try {
      await readCatalog(
        await fetch("/api/v1/packages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": mutationToken,
          },
          body: JSON.stringify({ projectId, source, scope }),
        })
      )
      setSource("")
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(null)
    }
  }

  async function mutate(packageId: string, operation: "remove" | "update") {
    setWorking(packageId)
    setError(null)
    try {
      await readCatalog(
        await fetch(
          operation === "remove"
            ? `/api/v1/packages/${packageId}?projectId=${encodeURIComponent(projectId)}`
            : `/api/v1/packages/${packageId}/update`,
          {
            method: operation === "remove" ? "DELETE" : "POST",
            headers: {
              ...(operation === "update"
                ? { "Content-Type": "application/json" }
                : {}),
              "X-Pi-Web-Codex-Mutation-Token": mutationToken,
            },
            body:
              operation === "update"
                ? JSON.stringify({ projectId })
                : undefined,
          }
        )
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="grid gap-6">
      <ResourceProjectControls
        projects={projects}
        projectId={projectId}
        catalog={catalog}
        mutationToken={mutationToken}
        working={trustWorking}
        onWorkingChange={setTrustWorking}
        onCatalogChange={setCatalog}
        onError={setError}
      />
      <Card>
        <CardHeader>
          <CardTitle>安装 Pi package</CardTitle>
          <CardDescription>
            直接交给 Pi DefaultPackageManager；支持 npm、git 和本地路径 source。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
            onSubmit={install}
          >
            <Input
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="npm:@scope/package 或 git:https://…"
              aria-label="Package source"
            />
            <Select
              value={scope}
              onValueChange={(value) => setScope(value as "global" | "project")}
            >
              <SelectTrigger aria-label="Package scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="project">Current Project</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              disabled={
                working !== null ||
                !source.trim() ||
                (scope === "project" && !catalog.projectTrusted)
              }
            >
              {working === "install" ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <PackagePlusIcon />
              )}
              安装
            </Button>
          </form>
        </CardContent>
      </Card>
      <section className="grid gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">已配置 Packages</h2>
          <span className="text-xs text-muted-foreground">
            {catalog.packages.length} 项
          </span>
        </div>
        {catalog.packages.length ? (
          catalog.packages.map((pkg) => (
            <Card key={pkg.id} size="sm">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {pkg.source}
                  <Badge variant="outline">
                    {pkg.scope === "global" ? "Global" : "Project"}
                  </Badge>
                  {pkg.missing ? (
                    <Badge variant="destructive">未安装</Badge>
                  ) : null}
                </CardTitle>
                <CardDescription className="break-all">
                  {pkg.installedPath ?? "Pi settings 中已配置，但本地安装缺失"}
                </CardDescription>
                <CardAction className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`更新 ${pkg.source}`}
                    disabled={working !== null}
                    onClick={() => void mutate(pkg.id, "update")}
                  >
                    {working === pkg.id ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : (
                      <RefreshCwIcon />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`移除 ${pkg.source}`}
                    disabled={working !== null}
                    onClick={() => void mutate(pkg.id, "remove")}
                  >
                    <Trash2Icon />
                  </Button>
                </CardAction>
              </CardHeader>
              {pkg.filtered ? (
                <CardContent className="text-xs text-muted-foreground">
                  资源 filter 已配置
                </CardContent>
              ) : null}
            </Card>
          ))
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            Pi settings 中还没有配置 package。
          </p>
        )}
      </section>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

"use client"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { ModelSettings } from "@/components/model-settings"
import { useI18n } from "@/components/i18n-provider"
import { useModelCatalog } from "@/hooks/use-model-catalog"

export function ModelSettingsLoader({
  mutationToken,
  sessionId,
  projectId,
}: {
  mutationToken: string
  sessionId: string | null
  projectId: string | null
}) {
  const { locale } = useI18n()
  const catalog = useModelCatalog(
    sessionId ? { sessionId } : { defaultTarget: true },
    "all"
  )

  if (catalog.snapshot) {
    return (
      <ModelSettings
        key={sessionId ?? "global"}
        initial={catalog.snapshot}
        mutationToken={mutationToken}
        sessionId={sessionId}
        extensionProjectId={projectId}
      />
    )
  }

  return (
    <Card aria-busy={catalog.status === "loading"}>
      <CardContent className="grid min-h-32 gap-3 py-6">
        {catalog.error ? (
          <>
            <p role="alert" className="min-w-0 flex-1 text-sm text-destructive">
              {catalog.error}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void catalog.retry().catch(() => undefined)}
            >
              {locale === "zh-CN" ? "重试" : "Retry"}
            </Button>
          </>
        ) : (
          <div
            role="status"
            className="grid gap-3 text-sm text-muted-foreground"
          >
            <p>
              {locale === "zh-CN"
                ? "正在加载模型目录…"
                : "Loading model catalog…"}
            </p>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

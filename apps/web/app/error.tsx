"use client"

import { useEffect } from "react"
import Link from "next/link"
import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@workspace/ui/components/empty"

import { useI18n } from "@/components/i18n-provider"

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  const { t } = useI18n()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="grid min-h-svh place-items-center px-6 py-12"
    >
      <Empty className="max-w-lg border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            {t("app.error.title")}
          </h1>
          <EmptyDescription>{t("app.error.description")}</EmptyDescription>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">
              {t("app.error.reference", { digest: error.digest })}
            </p>
          ) : null}
        </EmptyHeader>
        <EmptyContent className="sm:flex-row sm:justify-center">
          <Button type="button" onClick={() => unstable_retry()}>
            {t("app.error.retry")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/">{t("app.notFound.home")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}

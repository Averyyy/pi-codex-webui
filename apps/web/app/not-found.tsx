import Link from "next/link"
import { FileQuestionIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@workspace/ui/components/empty"

import { getLocalizedConfig } from "@/lib/i18n-server"

export default async function NotFound() {
  const { t } = await getLocalizedConfig()

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="grid min-h-svh place-items-center px-6 py-12"
    >
      <Empty className="max-w-lg border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            {t("app.notFound.title")}
          </h1>
          <EmptyDescription>{t("app.notFound.description")}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">{t("app.notFound.home")}</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}

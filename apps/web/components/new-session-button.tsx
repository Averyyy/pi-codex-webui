import Link from "next/link"
import { PlusIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { createTranslator, type Locale } from "@/lib/i18n"

export function NewSessionButton({
  projectId,
  locale,
}: {
  projectId: string
  locale: Locale
}) {
  const t = createTranslator(locale)

  return (
    <Button asChild>
      <Link href={`/new?projectId=${encodeURIComponent(projectId)}`}>
        <PlusIcon />
        {t("project.sessions.new")}
      </Link>
    </Button>
  )
}

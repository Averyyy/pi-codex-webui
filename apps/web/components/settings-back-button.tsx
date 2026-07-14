"use client"

import { useRouter } from "next/navigation"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function SettingsBackButton() {
  const router = useRouter()

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="返回上个界面"
      title="返回上个界面"
      onClick={() => router.back()}
    >
      <ArrowLeftIcon />
    </Button>
  )
}

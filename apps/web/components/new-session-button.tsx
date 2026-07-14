import Link from "next/link"
import { PlusIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

export function NewSessionButton({ projectId }: { projectId: string }) {
  return (
    <Button asChild>
      <Link href={`/new?projectId=${encodeURIComponent(projectId)}`}>
        <PlusIcon />
        新对话
      </Link>
    </Button>
  )
}

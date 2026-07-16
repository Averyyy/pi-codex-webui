import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react"

export function ConversationCompactionStatus({
  state,
}: {
  state: "running" | "complete"
}) {
  const running = state === "running"

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-sm"
    >
      {running ? (
        <LoaderCircleIcon className="animate-spin text-muted-foreground" />
      ) : (
        <CheckCircle2Icon className="text-muted-foreground" />
      )}
      <span>{running ? "正在压缩上下文" : "上下文已压缩"}</span>
    </div>
  )
}

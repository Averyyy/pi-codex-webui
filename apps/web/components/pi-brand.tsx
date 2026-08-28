import { cn } from "@workspace/ui/lib/utils"

export function PiBrand({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center gap-2", className)}
      aria-hidden="true"
    >
      {/* Pi's official mark is shared by the desktop and mobile app shells. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/pi-logo.svg" alt="" className="size-5 shrink-0 dark:invert" />
      <span className="font-heading text-[1.05rem] leading-none font-semibold tracking-normal">
        pi
      </span>
    </span>
  )
}

import { watch, type FSWatcher } from "node:fs"
import path from "node:path"

import { requireProject } from "@/lib/resource-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const encoder = new TextEncoder()

function projectChangeStream(projectPath: string, signal: AbortSignal) {
  let watcher: FSWatcher | undefined
  let heartbeat: NodeJS.Timeout | undefined
  let pending: NodeJS.Timeout | undefined
  let removeAbortListener: (() => void) | undefined

  const cleanup = () => {
    watcher?.close()
    if (heartbeat) clearInterval(heartbeat)
    if (pending) clearTimeout(pending)
    removeAbortListener?.()
    watcher = undefined
    heartbeat = undefined
    pending = undefined
    removeAbortListener = undefined
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal.aborted) {
        controller.close()
        return
      }

      controller.enqueue(encoder.encode(": connected\n\n"))
      watcher = watch(projectPath, { recursive: true }, (_event, filename) => {
        if (pending) clearTimeout(pending)
        pending = setTimeout(() => {
          const changedPath = filename
            ? filename.toString().split(path.sep).join("/")
            : null
          controller.enqueue(
            encoder.encode(
              `event: project.change\ndata: ${JSON.stringify({ changedAt: new Date().toISOString(), path: changedPath })}\n\n`
            )
          )
        }, 120)
      })
      watcher.once("error", (error) => {
        cleanup()
        controller.error(error)
      })
      heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": heartbeat\n\n")),
        15_000
      )

      const close = () => {
        cleanup()
        controller.close()
      }
      signal.addEventListener("abort", close, { once: true })
      removeAbortListener = () => signal.removeEventListener("abort", close)
    },
    cancel: cleanup,
  })
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/v1/projects/[projectId]/changes">
) {
  const { projectId } = await context.params
  const project = await requireProject(projectId)
  return new Response(projectChangeStream(project.path, request.signal), {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  })
}

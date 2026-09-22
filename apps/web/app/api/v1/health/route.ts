import { APP_NAME, APP_VERSION, DEFAULT_HOST, DEFAULT_PORT } from "@/lib/app"
import { getDatabase } from "@/lib/database"
import { updateMaintenanceState } from "@/lib/update-maintenance"

export const runtime = "nodejs"

// Initialize the candidate maintenance gate as soon as the health route is
// loaded, before any request handler can activate a worker.
updateMaintenanceState()

export async function GET() {
  try {
    await getDatabase()
    return Response.json(
      {
        status: "ok",
        name: APP_NAME,
        version: APP_VERSION,
        host: process.env.HOSTNAME ?? DEFAULT_HOST,
        port: Number(process.env.PORT ?? DEFAULT_PORT),
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return Response.json(
      {
        status: "error",
        name: APP_NAME,
        version: APP_VERSION,
        error: "The WebUI database could not be opened.",
        code: "DatabaseUnavailable",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
}

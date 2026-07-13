import { loadConfig } from "@/lib/config"
import { runtimeProfileViews } from "@/lib/runtime-profiles"

export const runtime = "nodejs"

export async function GET() {
  const config = await loadConfig()
  return Response.json(
    {
      revision: config.revision,
      defaultProfileId: config.developer.runtime.default,
      profiles: runtimeProfileViews(config),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}

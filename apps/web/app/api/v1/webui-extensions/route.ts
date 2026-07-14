import { loadWebUiExtensionSettings } from "@/lib/webui-extension-settings-data"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const projectId = searchParams.get("projectId")
  if (searchParams.get("scope") === "global") {
    const catalog = await webUiExtensionCatalog({
      projectId: null,
      projectTrusted: false,
    })
    const sessionId = searchParams.get("sessionId")
    if (sessionId) {
      catalog.statuses = getRuntimeSupervisor().webUiExtensionStatuses([
        sessionId,
      ])
    }
    return Response.json(catalog, {
      headers: { "Cache-Control": "no-store" },
    })
  }
  const data = await loadWebUiExtensionSettings(projectId ?? undefined)
  return Response.json(data.catalog, {
    headers: { "Cache-Control": "no-store" },
  })
}

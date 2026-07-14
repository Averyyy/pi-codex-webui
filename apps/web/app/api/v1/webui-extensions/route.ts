import { loadWebUiExtensionSettings } from "@/lib/webui-extension-settings-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId")
  const data = await loadWebUiExtensionSettings(projectId ?? undefined)
  return Response.json(data.catalog, {
    headers: { "Cache-Control": "no-store" },
  })
}

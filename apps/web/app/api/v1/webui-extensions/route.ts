import { loadWebUiExtensionCatalog } from "@/lib/webui-extension-settings-data"
import { validateLocalMutation } from "@/lib/request-security"
import { runtimeErrorResponse } from "@/lib/runtime-api"
import { getEventHub } from "@/lib/event-hub"
import { getRuntimeSupervisor } from "@/lib/runtime-supervisor"
import { webUiExtensionCatalog } from "@/lib/webui-extensions/registry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
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
    const data = await loadWebUiExtensionCatalog(projectId)
    const sessionId = searchParams.get("sessionId")
    if (sessionId) {
      data.catalog.statuses = getRuntimeSupervisor().webUiExtensionStatuses([
        sessionId,
      ])
    }
    return Response.json(data.catalog, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

export async function POST(request: Request) {
  const securityError = validateLocalMutation(request)
  if (securityError) {
    return Response.json({ error: securityError }, { status: 403 })
  }

  try {
    const searchParams = new URL(request.url).searchParams
    const projectId = searchParams.get("projectId")
    if (searchParams.get("scope") === "global") {
      const catalog = await webUiExtensionCatalog(
        { projectId: null, projectTrusted: false },
        { refresh: true }
      )
      const sessionId = searchParams.get("sessionId")
      if (sessionId) {
        catalog.statuses = getRuntimeSupervisor().webUiExtensionStatuses([
          sessionId,
        ])
      }
      getEventHub().publish({
        type: "webui.extension.catalog.invalidated",
        payload: {
          kind: "data-refresh",
          all: true,
          projectId: null,
          catalogIdentity: catalog.catalogIdentity,
          catalogVersion: catalog.catalogVersion,
        },
      })
      return Response.json(catalog, {
        headers: { "Cache-Control": "no-store" },
      })
    }
    const data = await loadWebUiExtensionCatalog(projectId, { refresh: true })
    const sessionId = searchParams.get("sessionId")
    if (sessionId) {
      data.catalog.statuses = getRuntimeSupervisor().webUiExtensionStatuses([
        sessionId,
      ])
    }
    getEventHub().publish({
      type: "webui.extension.catalog.invalidated",
      payload: {
        kind: "data-refresh",
        all: true,
        projectId: data.catalog.projectId,
        catalogIdentity: data.catalog.catalogIdentity,
        catalogVersion: data.catalog.catalogVersion,
      },
    })
    return Response.json(data.catalog, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    return runtimeErrorResponse(error)
  }
}

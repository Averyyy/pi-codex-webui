import { APP_NAME, APP_VERSION } from "@/lib/app"
import { loadConfig } from "@/lib/config"
import { listWorkspaceProjects } from "@/lib/catalog"

export const runtime = "nodejs"

export async function GET() {
  const [config, projects] = await Promise.all([
    loadConfig(),
    listWorkspaceProjects(),
  ])
  return Response.json(
    {
      application: { name: APP_NAME, version: APP_VERSION },
      config,
      projects,
      recentSessions: projects
        .flatMap((project) => project.sessions)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 20),
      capabilities: {
        readOnlySessionBrowser: true,
        piRuntime: true,
        runtimeMutations: true,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}

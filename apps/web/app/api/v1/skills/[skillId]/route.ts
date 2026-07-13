import { patchResource } from "@/lib/resource-route"

export const runtime = "nodejs"

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/v1/skills/[skillId]">
) {
  return patchResource(request, (await context.params).skillId, "skill")
}

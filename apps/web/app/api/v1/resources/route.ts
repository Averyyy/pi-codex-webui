import { getResources } from "@/lib/resource-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return getResources(request)
}

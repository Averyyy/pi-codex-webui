import {
  readWebUiAsset,
  webUiAssetContentType,
} from "@/lib/webui-extensions/asset-resolver"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/webui-extensions/[extensionId]/assets/[digest]/[file]">
) {
  const { extensionId, digest, file } = await context.params
  const content = await readWebUiAsset(extensionId, digest, file)
  if (!content) return new Response(null, { status: 404 })
  return new Response(content, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": webUiAssetContentType(file),
      "X-Content-Type-Options": "nosniff",
    },
  })
}

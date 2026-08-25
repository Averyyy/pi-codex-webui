import { NextRequest, NextResponse } from "next/server"

// DELETE /api/v1/pi-extensions/[extensionId] - Uninstall a Pi extension
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ extensionId: string }> }
) {
  try {
    const { extensionId } = await params
    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get("projectId")

    // Validate mutation token
    const mutationToken = request.headers.get("X-Pi-Web-Codex-Mutation-Token")
    if (!mutationToken) {
      return NextResponse.json(
        { error: "Missing mutation token" },
        { status: 400 }
      )
    }

    // TODO: Implement actual Pi extension uninstallation
    // This would:
    // 1. Stop the extension if it's running
    // 2. Unregister it from the Pi runtime
    // 3. Remove it from the filesystem (if not a core extension)
    // 4. Update the extension catalog

    // For now, return success with updated catalog
    const catalog = {
      extensions: [
        {
          id: "subagent",
          name: "@tintinweb/pi-subagents",
          version: "0.80.6",
          description: "多智能体协作扩展，支持并行任务执行",
          scope: "global",
          installed: true,
          updateAvailable: false,
          status: "active",
        },
        {
          id: "pi-ai",
          name: "@earendil-works/pi-ai",
          version: "0.80.6",
          description: "Pi AI 核心扩展",
          scope: "global",
          installed: true,
          updateAvailable: false,
          status: "active",
        },
      ],
      revision: 2,
      projectTrusted: true,
    }

    return NextResponse.json(catalog)
  } catch (error) {
    console.error("Failed to uninstall Pi extension:", error)
    return NextResponse.json(
      { error: "Failed to uninstall Pi extension" },
      { status: 500 }
    )
  }
}

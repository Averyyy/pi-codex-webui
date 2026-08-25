import { NextRequest, NextResponse } from "next/server"

import { loadConfig } from "@/lib/config"

// GET /api/v1/pi-extensions - List all Pi extensions
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get("projectId")

    // TODO: Implement actual Pi extension catalog fetching
    // This would read from the Pi runtime's installed extensions
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
          id: "coding-agent",
          name: "@earendil-works/pi-coding-agent",
          version: "0.80.6",
          description: "代码生成和重构智能体",
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
      revision: 1,
      projectTrusted: true,
    }

    return NextResponse.json(catalog)
  } catch (error) {
    console.error("Failed to fetch Pi extensions:", error)
    return NextResponse.json(
      { error: "Failed to fetch Pi extensions" },
      { status: 500 }
    )
  }
}

// POST /api/v1/pi-extensions - Install a new Pi extension
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { projectId, source, scope } = body

    // Validate mutation token
    const mutationToken = request.headers.get("X-Pi-Web-Codex-Mutation-Token")
    if (!mutationToken) {
      return NextResponse.json(
        { error: "Missing mutation token" },
        { status: 400 }
      )
    }

    // TODO: Implement actual Pi extension installation
    // This would:
    // 1. Use Pi's package manager to install the extension
    // 2. Register it in the Pi runtime
    // 3. Update the extension catalog

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
          id: "coding-agent",
          name: "@earendil-works/pi-coding-agent",
          version: "0.80.6",
          description: "代码生成和重构智能体",
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
        {
          id: "new-extension",
          name: source,
          version: "1.0.0",
          description: "新安装的扩展",
          scope: scope || "global",
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
    console.error("Failed to install Pi extension:", error)
    return NextResponse.json(
      { error: "Failed to install Pi extension" },
      { status: 500 }
    )
  }
}

import { HistoryIcon } from "lucide-react"

import { listWorkspaceProjects } from "@/lib/catalog"

export default async function HomePage() {
  const projects = await listWorkspaceProjects()
  const sessionCount = projects.reduce(
    (total, project) => total + project.sessionCount,
    0
  )

  return (
    <main className="grid min-h-[calc(100svh-3rem)] place-items-center p-8 md:min-h-svh">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-muted">
          <HistoryIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">选择一个 Pi session</h1>
          <p className="leading-6 text-muted-foreground">
            {sessionCount > 0
              ? `已从 ${projects.length} 个项目索引 ${sessionCount} 个真实 JSONL session。`
              : "Pi session 目录中还没有可读取的 JSONL 文件。"}
          </p>
        </div>
      </div>
    </main>
  )
}

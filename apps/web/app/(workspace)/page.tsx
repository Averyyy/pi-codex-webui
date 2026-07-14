import { MessageSquarePlusIcon } from "lucide-react"

import { listWorkspaceProjects, listWorkspaceTasks } from "@/lib/catalog"

export default async function HomePage() {
  const [projects, tasks] = await Promise.all([
    listWorkspaceProjects(),
    listWorkspaceTasks(),
  ])
  const sessionCount = projects.reduce(
    (total, project) => total + project.sessionCount,
    0
  )

  return (
    <main className="grid min-h-[calc(100svh-3rem)] place-items-center p-8 md:min-h-svh">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="grid size-12 place-items-center rounded-2xl bg-muted">
          <MessageSquarePlusIcon className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">开始一个任务</h1>
          <p className="leading-6 text-muted-foreground">
            点击左侧“新建任务”可直接与 Pi 对话，无需选择项目，也不会加载 Files
            或 Git。
            {sessionCount + tasks.length > 0
              ? ` 当前有 ${tasks.length} 个独立任务、${projects.length} 个项目。`
              : ""}
          </p>
        </div>
      </div>
    </main>
  )
}

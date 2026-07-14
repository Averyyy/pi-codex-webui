import { SessionScreen } from "@/components/session-screen"

export default async function TaskPage({
  params,
}: PageProps<"/tasks/[sessionId]">) {
  const { sessionId } = await params
  return <SessionScreen sessionId={sessionId} projectId={null} />
}

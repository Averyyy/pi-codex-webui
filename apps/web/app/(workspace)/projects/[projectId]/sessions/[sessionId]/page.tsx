import { SessionScreen } from "@/components/session-screen"

export default async function SessionPage({
  params,
}: PageProps<"/projects/[projectId]/sessions/[sessionId]">) {
  const { projectId, sessionId } = await params
  return <SessionScreen sessionId={sessionId} projectId={projectId} />
}

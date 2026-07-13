import type { RuntimeStatus } from "@workspace/runtime-protocol"

export type ProtocolEvent = {
  id: string
  seq: number
  type: string
  sessionId?: string
  operationId?: string
  timestamp: string
  payload: unknown
}

export type RuntimeCrash = {
  at: string
  code: number | null
  signal: NodeJS.Signals | null
  message: string
}

export type RuntimeDiagnostics = {
  status: RuntimeStatus
  active: boolean
  pid: number | null
  runtimeKind: "pi" | "pi-client" | null
  runtimeProfileId: string | null
  cwd: string | null
  workerPath: string | null
  startedAt: string | null
  lastActivityAt: string | null
  pendingRequests: number
  activeMcpCalls: number
  mcpServers: string[]
  activeTools: string[]
  crash: RuntimeCrash | null
  events: ProtocolEvent[]
}

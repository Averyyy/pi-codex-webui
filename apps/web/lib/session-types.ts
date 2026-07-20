import type { PiGoalState } from "@/lib/pi-goal"

export interface ProjectSummary {
  id: string
  path: string
  name: string
  sessionCount: number
  updatedAt: string
  isPinned: boolean
}

export interface SessionSummary {
  id: string
  projectId: string | null
  cwd: string
  nativeSessionId: string
  nativeSessionFile: string
  title: string | null
  firstMessage: string
  createdAt: string
  updatedAt: string
  messageCount: number
  archivedAt: string | null
  isPinned: boolean
  hasUnreadCompletion: boolean
  runtimeKind: "pi" | "pi-client"
  runtimeProfileId: string
  migratedFromSessionId: string | null
}

export interface ArchivedSession extends SessionSummary {
  projectName: string | null
}

export interface WorkspaceProject extends ProjectSummary {
  sessions: SessionSummary[]
}

export type TranscriptPart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string; redacted: boolean }
  | { type: "image"; data: string; mimeType: string }
  | {
      type: "toolCall"
      id: string
      name: string
      arguments: Record<string, unknown>
    }
  | { type: "unsupported"; partType: string; value: unknown }

export type TranscriptEntry =
  | {
      kind: "message"
      id: string
      timestamp: string
      role: string
      parts: TranscriptPart[]
      isError?: boolean
      toolCallId?: string
      toolName?: string
      details?: unknown
      metadata?: Record<string, unknown>
      branch?: {
        index: number
        total: number
        previousEntryId?: string
        nextEntryId?: string
      }
    }
  | {
      kind: "event"
      id: string
      timestamp: string
      eventType: string
      title: string
      text?: string
      value?: unknown
    }

export interface SessionSnapshot {
  session: SessionSummary & {
    projectPath: string | null
    projectName: string | null
    parentSessionFile: string | null
  }
  entries: TranscriptEntry[]
  goalState: PiGoalState | null
}

export interface SessionSearchResult {
  projectId: string | null
  projectName: string | null
  sessionId: string
  sessionTitle: string | null
  sessionFirstMessage: string
  entryId: string
  entryType: string
  timestamp: string
  snippet: string
}

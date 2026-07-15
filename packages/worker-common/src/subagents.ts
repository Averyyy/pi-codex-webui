import { randomUUID } from "node:crypto"

import {
  subagentCompactedEventSchema,
  subagentCreatedEventSchema,
  subagentFinishedEventSchema,
  subagentRpcReplySchema,
  subagentStartedEventSchema,
  subagentSteeredEventSchema,
  subagentsSnapshotSchema,
  type SubagentRecord,
  type SubagentsSnapshot,
} from "@workspace/runtime-protocol"

interface EventBus {
  emit(channel: string, data: unknown): void
  on(channel: string, handler: (data: unknown) => void): () => void
}

const STOP_TIMEOUT_MS = 5_000

export class SubagentBridge {
  private available = false
  private revision = 0
  private readonly agents = new Map<string, SubagentRecord>()
  private readonly unsubscribers: Array<() => void>

  constructor(
    private readonly events: EventBus,
    private readonly onSnapshot: (snapshot: SubagentsSnapshot) => void,
    private readonly now: () => number = Date.now
  ) {
    this.unsubscribers = [
      events.on("subagents:ready", () => {
        this.available = true
        this.publish()
      }),
      events.on("subagents:created", (raw) => this.created(raw)),
      events.on("subagents:started", (raw) => this.started(raw)),
      events.on("subagents:completed", (raw) => this.finished(raw)),
      events.on("subagents:failed", (raw) => this.finished(raw)),
      events.on("subagents:steered", (raw) => this.steered(raw)),
      events.on("subagents:compacted", (raw) => this.compacted(raw)),
    ]
  }

  snapshot(): SubagentsSnapshot {
    return subagentsSnapshotSchema.parse({
      version: 1,
      revision: this.revision,
      available: this.available,
      agents: [...this.agents.values()].sort(
        (left, right) => right.createdAt - left.createdAt
      ),
    })
  }

  async stop(agentId: string) {
    if (!this.available) {
      throw new Error("The subagents extension is not active.")
    }
    const agent = this.requireAgent(agentId)
    if (agent.status !== "queued" && agent.status !== "running") {
      throw new Error(`Subagent ${agentId} is already ${agent.status}.`)
    }

    const requestId = randomUUID()
    const channel = "subagents:rpc:stop"
    const replyChannel = `${channel}:reply:${requestId}`
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = this.events.on(replyChannel, (raw) => {
        clearTimeout(timeout)
        unsubscribe()
        const parsed = subagentRpcReplySchema.safeParse(raw)
        if (!parsed.success) {
          reject(parsed.error)
        } else if (!parsed.data.success) {
          reject(new Error(parsed.data.error))
        } else {
          resolve()
        }
      })
      const timeout = setTimeout(() => {
        unsubscribe()
        reject(new Error("The subagents extension did not answer stop."))
      }, STOP_TIMEOUT_MS)
      this.events.emit(channel, { requestId, agentId })
    })
  }

  dispose() {
    for (const unsubscribe of this.unsubscribers) unsubscribe()
    this.unsubscribers.length = 0
  }

  private created(raw: unknown) {
    const event = subagentCreatedEventSchema.parse(raw)
    const current = this.agents.get(event.id)
    this.agents.set(event.id, {
      id: event.id,
      type: event.type,
      description: event.description,
      status: current?.status ?? "queued",
      isBackground: event.isBackground,
      createdAt: current?.createdAt ?? this.now(),
      startedAt: current?.startedAt,
      completedAt: current?.completedAt,
      durationMs: current?.durationMs,
      tokens: current?.tokens,
      toolUses: current?.toolUses ?? 0,
      error: current?.error,
      compactionCount: current?.compactionCount ?? 0,
      lastSteer: current?.lastSteer,
    })
    this.publish()
  }

  private started(raw: unknown) {
    const event = subagentStartedEventSchema.parse(raw)
    const current = this.agents.get(event.id)
    const now = this.now()
    this.agents.set(event.id, {
      id: event.id,
      type: event.type,
      description: event.description,
      status: "running",
      isBackground: current?.isBackground,
      createdAt: current?.createdAt ?? now,
      startedAt: current?.startedAt ?? now,
      toolUses: current?.toolUses ?? 0,
      compactionCount: current?.compactionCount ?? 0,
      lastSteer: current?.lastSteer,
    })
    this.publish()
  }

  private finished(raw: unknown) {
    const event = subagentFinishedEventSchema.parse(raw)
    const current = this.requireAgent(event.id)
    const completedAt = this.now()
    this.agents.set(event.id, {
      ...current,
      type: event.type,
      description: event.description,
      status: event.status,
      startedAt: current.startedAt ?? completedAt - event.durationMs,
      completedAt,
      durationMs: event.durationMs,
      tokens: event.tokens,
      toolUses: event.toolUses,
      error: event.error,
    })
    this.publish()
  }

  private steered(raw: unknown) {
    const event = subagentSteeredEventSchema.parse(raw)
    const current = this.requireAgent(event.id)
    this.agents.set(event.id, { ...current, lastSteer: event.message })
    this.publish()
  }

  private compacted(raw: unknown) {
    const event = subagentCompactedEventSchema.parse(raw)
    const current = this.requireAgent(event.id)
    this.agents.set(event.id, {
      ...current,
      type: event.type,
      description: event.description,
      compactionCount: event.compactionCount,
    })
    this.publish()
  }

  private requireAgent(agentId: string) {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Unknown subagent: ${agentId}`)
    return agent
  }

  private publish() {
    this.revision += 1
    this.onSnapshot(this.snapshot())
  }
}

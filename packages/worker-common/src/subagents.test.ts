import assert from "node:assert/strict"
import test from "node:test"

import type { SubagentsSnapshot } from "@workspace/runtime-protocol"

import { SubagentBridge } from "./subagents.js"

class TestEventBus {
  private readonly handlers = new Map<string, Set<(data: unknown) => void>>()

  emit(channel: string, data: unknown) {
    for (const handler of this.handlers.get(channel) ?? []) handler(data)
  }

  on(channel: string, handler: (data: unknown) => void) {
    const handlers = this.handlers.get(channel) ?? new Set()
    handlers.add(handler)
    this.handlers.set(channel, handlers)
    return () => handlers.delete(handler)
  }
}

test("tracks the structured subagent lifecycle even when started precedes created", () => {
  const events = new TestEventBus()
  const snapshots: SubagentsSnapshot[] = []
  let now = 1_000
  const bridge = new SubagentBridge(
    events,
    (snapshot) => snapshots.push(snapshot),
    () => now
  )

  events.emit("subagents:ready", {})
  events.emit("subagents:started", {
    id: "agent-1",
    type: "worker",
    description: "Implement the feature",
  })
  events.emit("subagents:created", {
    id: "agent-1",
    type: "worker",
    description: "Implement the feature",
    isBackground: true,
  })
  events.emit("subagents:steered", {
    id: "agent-1",
    message: "Focus on the root cause",
  })
  events.emit("subagents:compacted", {
    id: "agent-1",
    type: "worker",
    description: "Implement the feature",
    reason: "threshold",
    tokensBefore: 10_000,
    compactionCount: 1,
  })
  now = 2_500
  events.emit("subagents:completed", {
    id: "agent-1",
    type: "worker",
    description: "Implement the feature",
    status: "completed",
    toolUses: 4,
    durationMs: 1_500,
    tokens: { input: 100, output: 50, total: 150 },
  })

  assert.equal(snapshots[0]?.available, true)
  assert.deepEqual(bridge.snapshot().agents, [
    {
      id: "agent-1",
      type: "worker",
      description: "Implement the feature",
      status: "completed",
      isBackground: true,
      createdAt: 1_000,
      startedAt: 1_000,
      completedAt: 2_500,
      durationMs: 1_500,
      tokens: { input: 100, output: 50, total: 150 },
      toolUses: 4,
      error: undefined,
      compactionCount: 1,
      lastSteer: "Focus on the root cause",
    },
  ])
})

test("stops an active subagent through the extension RPC", async () => {
  const events = new TestEventBus()
  const bridge = new SubagentBridge(events, () => {})
  events.emit("subagents:ready", {})
  events.emit("subagents:started", {
    id: "agent-2",
    type: "reviewer",
    description: "Review the patch",
  })
  events.on("subagents:rpc:stop", (raw) => {
    const request = raw as { requestId: string; agentId: string }
    assert.equal(request.agentId, "agent-2")
    events.emit(`subagents:rpc:stop:reply:${request.requestId}`, {
      success: true,
    })
  })

  await bridge.stop("agent-2")
})

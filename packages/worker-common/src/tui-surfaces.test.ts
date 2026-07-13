import assert from "node:assert/strict"
import test from "node:test"

import type {
  ExtensionUIContext,
  KeybindingsManager,
} from "@earendil-works/pi-coding-agent"
import * as tui from "@earendil-works/pi-tui"
import type { TuiSurfaceEvent } from "@workspace/runtime-protocol"

import { TuiSurfaceManager } from "./tui-surfaces.js"

test("a real Pi TUI surface renders, accepts input, and closes", async () => {
  const events: TuiSurfaceEvent[] = []
  const listeners = new Set<(event: TuiSurfaceEvent) => void>()
  const waitForWrite = (text: string, afterRevision = 0) => {
    const match = (event: TuiSurfaceEvent) =>
      event.kind === "write" &&
      event.revision > afterRevision &&
      event.data.includes(text)
    const existing = events.find(match)
    if (existing?.kind === "write") return Promise.resolve(existing)
    return new Promise<Extract<TuiSurfaceEvent, { kind: "write" }>>(
      (resolve) => {
        const listener = (event: TuiSurfaceEvent) => {
          if (!match(event) || event.kind !== "write") return
          listeners.delete(listener)
          resolve(event)
        }
        listeners.add(listener)
      }
    )
  }
  const manager = new TuiSurfaceManager(
    tui,
    {} as ExtensionUIContext["theme"],
    tui.getKeybindings() as unknown as KeybindingsManager,
    {
      getGitBranch: () => null,
      getExtensionStatuses: () => new Map(),
      getAvailableProviderCount: () => 0,
      onBranchChange: () => () => {},
    },
    (event) => {
      events.push(event)
      for (const listener of listeners) listener(event)
    }
  )
  let value = ""
  const inputs: string[] = []
  const surfaceId = manager.set(
    "test",
    "inline",
    "aboveEditor",
    (surfaceTui) => ({
      render: () => [`Value: ${value}`],
      handleInput(data) {
        inputs.push(data)
        value += data
        surfaceTui.requestRender()
      },
      invalidate() {},
    })
  )

  const firstRender = await waitForWrite("Value: ")
  assert.match((await manager.snapshots())[0]?.data ?? "", /Value: /)

  manager.action(surfaceId, { version: 1, action: "input", data: "xy" })
  const secondRender = await waitForWrite("xy", firstRender.revision)
  assert.deepEqual(inputs, ["x", "y"])
  assert.match((await manager.snapshots())[0]?.data ?? "", /Value: xy/)

  manager.action(surfaceId, {
    version: 1,
    action: "input",
    data: "\x1b[200~pasted\x1b[201~",
  })
  await waitForWrite("pasted", secondRender.revision)
  assert.equal(inputs.at(-1), "\x1b[200~pasted\x1b[201~")

  manager.remove("test")
  assert.equal((await manager.snapshots()).length, 0)
  assert.equal(
    events.some(
      (event) => event.kind === "close" && event.surfaceId === surfaceId
    ),
    true
  )
})

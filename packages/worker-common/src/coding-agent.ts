import type { ModelRegistry } from "@earendil-works/pi-coding-agent"
import type * as CodingAgent from "@earendil-works/pi-coding-agent"
import type * as PiTui from "@earendil-works/pi-tui"
import type { ThinkingLevel } from "@workspace/runtime-protocol"

export type CodingAgentModule = typeof CodingAgent
export type TuiModule = typeof PiTui

type CodingModel = ReturnType<ModelRegistry["getAll"]>[number]

export interface ModelThinkingModule {
  getSupportedThinkingLevels(model: CodingModel): ThinkingLevel[]
  clampThinkingLevel(model: CodingModel, level: ThinkingLevel): ThinkingLevel
}

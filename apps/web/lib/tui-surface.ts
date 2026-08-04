import type { TuiSurfaceSnapshot } from "@workspace/runtime-protocol"

import { stripAnsi } from "./ansi"

export function isVisibleTuiSurface(surface: TuiSurfaceSnapshot) {
  return (
    surface.mode !== "inline" ||
    stripAnsi(surface.data).trim().length > 0 ||
    surface.title !== undefined ||
    surface.progress
  )
}

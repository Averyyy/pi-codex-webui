import type { TuiSurfaceSnapshot } from "@workspace/runtime-protocol"

export function isVisibleTuiSurface(surface: TuiSurfaceSnapshot) {
  return (
    surface.mode !== "inline" ||
    surface.data.length > 0 ||
    surface.title !== undefined ||
    surface.progress
  )
}

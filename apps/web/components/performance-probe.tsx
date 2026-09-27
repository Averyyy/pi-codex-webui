"use client"

import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react"

import { recordReactProfilerMetric } from "@/lib/performance-diagnostics"

export type PerformanceProbeId =
  | "conversationComposer"
  | "composerModelOptions"
  | "sessionRuntime"
  | "sessionWorkspace"

const onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
  if (
    id === "conversationComposer" ||
    id === "composerModelOptions" ||
    id === "sessionRuntime" ||
    id === "sessionWorkspace"
  ) {
    recordReactProfilerMetric(id, actualDuration)
  }
}

export function PerformanceProbe({
  id,
  children,
}: {
  id: PerformanceProbeId
  children: ReactNode
}) {
  if (process.env.NODE_ENV === "production") return <>{children}</>
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  )
}

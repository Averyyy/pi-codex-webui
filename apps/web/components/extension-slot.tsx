"use client"

import { useContext } from "react"

import type { WebUiPlacement } from "@workspace/runtime-protocol"

import { SessionExtensionContext } from "@/components/session-extension-provider"
import { WebUiViewHost } from "@/components/webui-view-host"

export function ExtensionSlot({
  name,
  excludeViewIds = [],
}: {
  name: WebUiPlacement
  excludeViewIds?: string[]
}) {
  const runtime = useContext(SessionExtensionContext)
  if (!runtime)
    throw new Error("ExtensionSlot requires SessionExtensionProvider.")
  return runtime.views
    .filter(
      (view) =>
        view.placement === name && !excludeViewIds.includes(view.viewId)
    )
    .map((view) => <WebUiViewHost key={view.instanceId} view={view} />)
}

"use client"

import { useContext } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import type { WebUiViewSnapshot } from "@workspace/runtime-protocol"

import { SessionExtensionContext } from "@/components/session-extension-provider"
import { WebUiViewHost } from "@/components/webui-view-host"

export function ExtensionOverlayHosts() {
  const runtime = useContext(SessionExtensionContext)
  if (!runtime) {
    throw new Error("ExtensionOverlayHosts requires SessionExtensionProvider.")
  }
  const close = (view: WebUiViewSnapshot) => {
    void runtime
      .invoke(view, "__close", { cancelled: true })
      .catch((error: unknown) =>
        runtime.report(
          view,
          "error",
          error instanceof Error ? error.message : String(error)
        )
      )
      .catch(console.error)
  }
  return (
    <>
      {runtime.views
        .filter(
          (view) =>
            view.placement === "session.dialog" ||
            view.placement === "session.overlay"
        )
        .map((view) => (
          <Dialog
            key={view.instanceId}
            open
            onOpenChange={(open) => {
              if (!open) close(view)
            }}
          >
            <DialogContent
              className={
                view.placement === "session.overlay"
                  ? "sm:max-w-4xl"
                  : undefined
              }
            >
              <DialogHeader>
                <DialogTitle>{view.title ?? "Pi extension"}</DialogTitle>
                <DialogDescription className="sr-only">
                  Interactive WebUI extension view.
                </DialogDescription>
              </DialogHeader>
              <WebUiViewHost view={view} />
            </DialogContent>
          </Dialog>
        ))}
      {runtime.views
        .filter((view) => view.placement === "session.rightPanel")
        .map((view) => (
          <Sheet
            key={view.instanceId}
            open
            onOpenChange={(open) => {
              if (!open) close(view)
            }}
          >
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{view.title ?? "Pi extension"}</SheetTitle>
                <SheetDescription className="sr-only">
                  Interactive WebUI extension panel.
                </SheetDescription>
              </SheetHeader>
              <WebUiViewHost view={view} />
            </SheetContent>
          </Sheet>
        ))}
    </>
  )
}

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
import { cn } from "@workspace/ui/lib/utils"

import { SessionExtensionContext } from "@/components/session-extension-provider"
import { useI18n } from "@/components/i18n-provider"
import { WebUiViewHost } from "@/components/webui-view-host"

export function ExtensionOverlayHosts() {
  const { t } = useI18n()
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
              onCloseAutoFocus={(event) => {
                const composer = document.querySelector<HTMLTextAreaElement>(
                  "[data-composer-input]"
                )
                if (!composer) return
                event.preventDefault()
                composer.focus()
              }}
              className={cn(
                "flex max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] min-w-0 flex-col overflow-hidden",
                view.placement === "session.overlay"
                  ? "max-w-4xl sm:max-w-4xl"
                  : "max-w-2xl sm:max-w-2xl"
              )}
            >
              <DialogHeader className="shrink-0">
                <DialogTitle>
                  {view.title ?? t("session.extension.defaultTitle")}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {t("session.extension.viewDescription")}
                </DialogDescription>
              </DialogHeader>
              <WebUiViewHost
                view={view}
                className="min-h-0 flex-1 overflow-auto overscroll-contain"
              />
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
            <SheetContent
              className="min-w-0 gap-0 overflow-hidden"
              onCloseAutoFocus={(event) => {
                const composer = document.querySelector<HTMLTextAreaElement>(
                  "[data-composer-input]"
                )
                if (!composer) return
                event.preventDefault()
                composer.focus()
              }}
            >
              <SheetHeader className="shrink-0">
                <SheetTitle>
                  {view.title ?? t("session.extension.defaultTitle")}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {t("session.extension.panelDescription")}
                </SheetDescription>
              </SheetHeader>
              <WebUiViewHost
                view={view}
                className="min-h-0 flex-1 overflow-auto overscroll-contain"
              />
            </SheetContent>
          </Sheet>
        ))}
    </>
  )
}

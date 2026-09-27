"use client"

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
import { cn } from "@workspace/ui/lib/utils"

import { useI18n } from "@/components/i18n-provider"
import {
  useSessionExtensionRuntime,
  useSessionExtensionView,
  useSessionExtensionViewIds,
} from "@/components/session-extension-provider"
import { WebUiViewHost } from "@/components/webui-view-host"

function ExtensionDialogView({ instanceId }: { instanceId: string }) {
  const { t } = useI18n()
  const runtime = useSessionExtensionRuntime()
  const view = useSessionExtensionView(instanceId)
  if (!view) return null
  const close = () => {
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
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
          instanceId={view.instanceId}
          className="min-h-0 flex-1 overflow-auto overscroll-contain"
        />
      </DialogContent>
    </Dialog>
  )
}

function ExtensionPanelView({ instanceId }: { instanceId: string }) {
  const { t } = useI18n()
  const runtime = useSessionExtensionRuntime()
  const view = useSessionExtensionView(instanceId)
  if (!view) return null
  const close = () => {
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
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) close()
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
          instanceId={view.instanceId}
          className="min-h-0 flex-1 overflow-auto overscroll-contain"
        />
      </SheetContent>
    </Sheet>
  )
}

export function ExtensionOverlayHosts() {
  const dialogs = useSessionExtensionViewIds("session.dialog")
  const overlays = useSessionExtensionViewIds("session.overlay")
  const panels = useSessionExtensionViewIds("session.rightPanel")
  const dialogIds = [...dialogs, ...overlays]
  return (
    <>
      {dialogIds.map((instanceId) => (
        <ExtensionDialogView key={instanceId} instanceId={instanceId} />
      ))}
      {panels.map((instanceId) => (
        <ExtensionPanelView key={instanceId} instanceId={instanceId} />
      ))}
    </>
  )
}

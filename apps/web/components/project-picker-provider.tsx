"use client"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { responseJson } from "@/lib/api-response"
import type {
  ProjectDirectoryListing,
  AddedProject,
} from "@/lib/project-picker-client"
import type { ProjectDirectoryDialogProps } from "@/components/project-directory-dialog"
type Pick = (token: string) => Promise<AddedProject | null>
const PickerContext = createContext<Pick | null>(null)
export function useProjectPicker() {
  const picker = useContext(PickerContext)
  if (!picker) throw new Error("ProjectPickerProvider is missing.")
  return picker
}
export function ProjectPickerProvider({ children }: { children: ReactNode }) {
  const pending = useRef<{
    resolve: (project: AddedProject | null) => void
    reject: (error: unknown) => void
    trigger: HTMLElement | null
    controller: AbortController
  } | null>(null)
  const [dialog, setDialog] = useState<{
    Component: ComponentType<ProjectDirectoryDialogProps>
    token: string
    initialListing: ProjectDirectoryListing
  } | null>(null)
  const close = useCallback((project: AddedProject | null) => {
    const request = pending.current
    request?.resolve(project)
    pending.current = null
    requestAnimationFrame(() => {
      if (request?.trigger?.isConnected) request.trigger.focus()
    })
    setDialog(null)
  }, [])
  const pick = useCallback<Pick>((token) => {
    if (pending.current)
      return Promise.reject(new Error("A folder picker is already open."))
    return new Promise((resolve, reject) => {
      const request = {
        resolve,
        reject,
        controller: new AbortController(),
        trigger:
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null,
      }
      pending.current = request
      void Promise.all([
        import("@/components/project-directory-dialog"),
        fetch("/api/v1/projects/pick", {
          method: "POST",
          signal: request.controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Pi-Web-Codex-Mutation-Token": token,
          },
          body: "{}",
        }).then((response) => responseJson<ProjectDirectoryListing>(response)),
      ])
        .then(([{ ProjectDirectoryDialog }, initialListing]) => {
          if (pending.current === request)
            setDialog({
              Component: ProjectDirectoryDialog,
              token,
              initialListing,
            })
        })
        .catch((error: unknown) => {
          if (pending.current === request) {
            pending.current = null
            reject(error)
          }
        })
    })
  }, [])
  useEffect(
    () => () => {
      pending.current?.controller.abort()
      pending.current?.resolve(null)
      pending.current = null
    },
    []
  )
  return (
    <PickerContext.Provider value={pick}>
      {children}
      {dialog ? (
        <dialog.Component
          token={dialog.token}
          initialListing={dialog.initialListing}
          onClose={close}
        />
      ) : null}
    </PickerContext.Provider>
  )
}

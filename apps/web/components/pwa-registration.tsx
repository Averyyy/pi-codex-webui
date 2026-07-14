"use client"

import { useEffect } from "react"

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return
    if (process.env.NODE_ENV !== "production") {
      void Promise.all([
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(
              registrations
                .filter((registration) =>
                  [
                    registration.active,
                    registration.installing,
                    registration.waiting,
                  ].some(
                    (worker) =>
                      worker && new URL(worker.scriptURL).pathname === "/sw.js"
                  )
                )
                .map((registration) => registration.unregister())
            )
          ),
        caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("pi-web-codex-static-"))
                .map((key) => caches.delete(key))
            )
          ),
      ]).catch((error: unknown) => {
        console.error("Could not clear development PWA state:", error)
      })
      return
    }
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error(
        "Could not register the pi-web-codex service worker:",
        error
      )
    })
  }, [])

  return null
}

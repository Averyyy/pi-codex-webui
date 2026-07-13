"use client"

import { useEffect } from "react"

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error(
        "Could not register the pi-web-codex service worker:",
        error
      )
    })
  }, [])

  return null
}

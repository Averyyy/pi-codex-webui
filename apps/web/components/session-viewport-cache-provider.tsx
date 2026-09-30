"use client"

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { SessionViewportCache } from "@/lib/session-viewport-cache"

const Context = createContext<SessionViewportCache | null>(null)

export function SessionViewportCacheProvider({
  children,
}: {
  children: ReactNode
}) {
  const [cache] = useState(() => new SessionViewportCache())
  const disposalGeneration = useRef(0)
  useEffect(() => {
    const generationState = disposalGeneration
    const generation = ++generationState.current
    return () => {
      queueMicrotask(() => {
        if (generationState.current === generation) cache.dispose()
      })
    }
  }, [cache])
  return <Context value={cache}>{children}</Context>
}

export function useSessionViewportCache() {
  const cache = useContext(Context)
  if (!cache) {
    throw new Error("Session viewport cache requires its root provider.")
  }
  return cache
}

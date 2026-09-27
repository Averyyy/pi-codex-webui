"use client"

import ErrorPage from "@/app/error"
import { SessionRouteRejected } from "@/components/session-viewport-host"

export default function SessionError(props: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <>
      <SessionRouteRejected />
      <ErrorPage {...props} />
    </>
  )
}

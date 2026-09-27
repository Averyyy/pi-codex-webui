import NotFound from "@/app/not-found"
import { SessionRouteRejected } from "@/components/session-viewport-host"

export default async function SessionNotFound() {
  return (
    <>
      <SessionRouteRejected />
      <NotFound />
    </>
  )
}

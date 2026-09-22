import { ApiError } from "./api-response"

export interface RuntimeDraftRequestIdentity {
  generation: number | symbol | object
  projectId: string | null
  draftId: string
  leaseId: string
}

export function sameRuntimeDraftRequest(
  left: RuntimeDraftRequestIdentity,
  right: RuntimeDraftRequestIdentity | null
) {
  return (
    right !== null &&
    left.generation === right.generation &&
    left.projectId === right.projectId &&
    left.draftId === right.draftId &&
    left.leaseId === right.leaseId
  )
}

export function isRecoverableRuntimeDraftLeaseError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === "RuntimeDraftLeaseNotFound" ||
      error.code === "RuntimeDraftNotFound")
  )
}

export function createSingleFlight<T>() {
  let inFlight: Promise<T> | null = null

  return {
    run(operation: () => Promise<T>) {
      if (inFlight) return inFlight
      const operationPromise = Promise.resolve().then(operation)
      const tracked = operationPromise.finally(() => {
        if (inFlight === tracked) inFlight = null
      })
      inFlight = tracked
      return tracked
    },
  }
}

import "server-only"

import { isRuntimeRequestError, RuntimeRequestError } from "./runtime-error"

export function runtimeErrorResponse(error: unknown) {
  if (!isRuntimeRequestError(error)) throw error
  const status =
    error.code === "InvalidJson"
      ? 400
      : error.code === "ProjectRequired"
        ? 400
        : error.code === "SessionNotFound" || error.code === "ProjectNotFound"
          ? 404
          : error.code === "SessionWriteLeaseConflict" ||
              error.code === "RuntimeNotActive" ||
              error.code === "RuntimeBusy" ||
              error.code === "SessionOperationCancelled"
            ? 409
            : 422
  return Response.json({ error: error.message, code: error.code }, { status })
}

export async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as unknown
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new RuntimeRequestError("InvalidJson", "Invalid JSON body.")
    }
    throw error
  }
}

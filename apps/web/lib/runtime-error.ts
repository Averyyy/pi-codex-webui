import "server-only"

export class RuntimeRequestError extends Error {
  readonly isPiWebCodexRuntimeRequestError = true

  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = "RuntimeRequestError"
  }
}

export function isRuntimeRequestError(
  error: unknown
): error is RuntimeRequestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isPiWebCodexRuntimeRequestError" in error &&
    error.isPiWebCodexRuntimeRequestError === true &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  )
}

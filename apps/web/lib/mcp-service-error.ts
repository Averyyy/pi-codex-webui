export type McpServiceErrorCode =
  "McpServerNotFound" | "McpProjectNotTrusted" | "McpConnectionFailed"

export interface McpServiceErrorShape {
  readonly isPiWebCodexMcpServiceError: true
  readonly code: McpServiceErrorCode
  readonly message: string
}

export class McpServiceError extends Error implements McpServiceErrorShape {
  readonly isPiWebCodexMcpServiceError = true

  constructor(
    readonly code: McpServiceErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = "McpServiceError"
  }
}

export function isMcpServiceError(
  error: unknown
): error is McpServiceErrorShape {
  return (
    typeof error === "object" &&
    error !== null &&
    "isPiWebCodexMcpServiceError" in error &&
    error.isPiWebCodexMcpServiceError === true &&
    "code" in error &&
    (error.code === "McpServerNotFound" ||
      error.code === "McpProjectNotTrusted" ||
      error.code === "McpConnectionFailed") &&
    "message" in error &&
    typeof error.message === "string"
  )
}

export function mcpServiceErrorResponse(error: McpServiceErrorShape) {
  return {
    body: { error: error.message, code: error.code },
    status: error.code === "McpServerNotFound" ? 404 : 422,
  } as const
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

export async function responseJson<T>(response: Response) {
  const text = await response.text()
  let result: (T & { error?: string; code?: string }) | undefined

  if (text) {
    try {
      result = JSON.parse(text) as T & { error?: string; code?: string }
    } catch {
      if (response.ok) {
        throw new ApiError("服务器返回了无效响应。")
      }
    }
  }

  if (!response.ok) {
    throw new ApiError(
      result?.error ?? `操作失败（HTTP ${response.status}）。`,
      result?.code
    )
  }
  if (!result) throw new ApiError("服务器返回了空响应。")
  return result
}

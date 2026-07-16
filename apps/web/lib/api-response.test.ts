import assert from "node:assert/strict"
import test from "node:test"

import { ApiError, responseJson } from "./api-response"

test("responseJson preserves structured API errors", async () => {
  await assert.rejects(
    responseJson(
      Response.json(
        { error: "模型不可用。", code: "ModelUnavailable" },
        { status: 422 }
      )
    ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.message === "模型不可用。" &&
      error.code === "ModelUnavailable"
  )
})

test("responseJson reports the HTTP status for a non-JSON error", async () => {
  await assert.rejects(
    responseJson(new Response("Internal Server Error", { status: 500 })),
    (error: unknown) =>
      error instanceof ApiError && error.message === "操作失败（HTTP 500）。"
  )
})

test("responseJson rejects an invalid successful response", async () => {
  await assert.rejects(
    responseJson(new Response("not json")),
    (error: unknown) =>
      error instanceof ApiError && error.message === "服务器返回了无效响应。"
  )
})

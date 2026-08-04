import assert from "node:assert/strict"
import test from "node:test"

import { ApiError, responseJson, validatedResponseJson } from "./api-response"

test("responseJson preserves structured API errors", async () => {
  await assert.rejects(
    responseJson(
      Response.json(
        { error: "模型不可用。", code: "ModelUnavailable" },
        { status: 422 }
      )
    ),
    (error: unknown) => {
      if (
        !(error instanceof ApiError) ||
        error.message !== "模型不可用。" ||
        error.code !== "ModelUnavailable"
      ) {
        return false
      }
      assert.deepEqual(error.details, {
        error: "模型不可用。",
        code: "ModelUnavailable",
      })
      return true
    }
  )
})

test("responseJson reports the HTTP status for a non-JSON error", async () => {
  await assert.rejects(
    responseJson(new Response("Internal Server Error", { status: 500 })),
    (error: unknown) =>
      error instanceof ApiError && error.message === "操作失败（HTTP 500）。"
  )
})

test("responseJson uses a localized fallback for a non-JSON error", async () => {
  await assert.rejects(
    responseJson(
      new Response("Internal Server Error", { status: 500 }),
      "Model settings operation failed."
    ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.message === "Model settings operation failed."
  )
})

test("responseJson rejects an invalid successful response", async () => {
  await assert.rejects(
    responseJson(new Response("not json")),
    (error: unknown) =>
      error instanceof ApiError && error.message === "服务器返回了无效响应。"
  )
})

test("validatedResponseJson rejects a successful response with the wrong shape", async () => {
  await assert.rejects(
    validatedResponseJson(
      Response.json({ revision: "stale" }),
      (value) => {
        if (
          typeof value !== "object" ||
          value === null ||
          !("revision" in value) ||
          typeof value.revision !== "number"
        ) {
          throw new Error("Invalid response")
        }
        return value.revision
      },
      "读取设置失败。"
    ),
    (error: unknown) =>
      error instanceof ApiError && error.message === "读取设置失败。"
  )
})

import assert from "node:assert/strict"
import test from "node:test"

import {
  isWebAccessToolName,
  webAccessToolPresentation,
} from "./web-access-tool.js"

test("recognizes only pi-web-access tool names", () => {
  assert.equal(isWebAccessToolName("web_search"), true)
  assert.equal(isWebAccessToolName("fetch_content"), true)
  assert.equal(isWebAccessToolName("get_search_content"), true)
  assert.equal(isWebAccessToolName("search"), false)
})

test("presents web search queries and structured result metadata", () => {
  assert.deepEqual(
    webAccessToolPresentation(
      "web_search",
      { queries: ["Next.js 16 caching", "React 19 activity"] },
      {
        successfulQueries: 2,
        queryCount: 2,
        totalResults: 9,
        curated: true,
        curatedFrom: 3,
        searchId: "search-1",
      }
    ),
    {
      label: "网络搜索",
      preview: "2 个查询 · Next.js 16 caching",
      inputs: ["Next.js 16 caching", "React 19 activity"],
      facts: [
        { label: "查询", value: "2/2 成功" },
        { label: "来源", value: "9 个" },
        { label: "筛选", value: "2/3 个查询" },
        { label: "搜索 ID", value: "search-1" },
      ],
      error: undefined,
    }
  )
})

test("presents fetched content without parsing result text", () => {
  const presentation = webAccessToolPresentation(
    "fetch_content",
    { url: "https://example.com/guide" },
    {
      successful: 1,
      urlCount: 1,
      totalChars: 1234,
      truncated: true,
      responseId: "fetch-1",
    }
  )
  assert.equal(presentation.preview, "https://example.com/guide")
  assert.deepEqual(presentation.facts, [
    { label: "地址", value: "1/1 成功" },
    { label: "内容", value: "1,234 字符" },
    { label: "状态", value: "已截断" },
    { label: "内容 ID", value: "fetch-1" },
  ])
})

test("presents stored search-content selectors", () => {
  const presentation = webAccessToolPresentation(
    "get_search_content",
    { responseId: "fetch-1", urlIndex: 0 },
    { title: "Guide", contentLength: 900 }
  )
  assert.equal(presentation.preview, "地址 #0")
  assert.deepEqual(presentation.facts, [
    { label: "内容 ID", value: "fetch-1" },
    { label: "内容", value: "900 字符" },
  ])
})

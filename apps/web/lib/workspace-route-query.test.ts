import assert from "node:assert/strict"
import test from "node:test"

import {
  resolveNewConversationProjectQuery,
  resolveSearchQuery,
} from "@/lib/workspace-route-query"

const projectIds = new Set(["project-a", "项目/b"])

test("new conversation accepts an available project without redirecting", () => {
  assert.deepEqual(
    resolveNewConversationProjectQuery("project-a", projectIds),
    { value: "project-a", canonicalHref: null }
  )
})

test("new conversation canonicalizes repeated and padded project queries", () => {
  assert.deepEqual(
    resolveNewConversationProjectQuery([" 项目/b ", "ignored"], projectIds),
    {
      value: "项目/b",
      canonicalHref: "/new?projectId=%E9%A1%B9%E7%9B%AE%2Fb",
    }
  )
})

test("new conversation removes an unavailable project query", () => {
  assert.deepEqual(resolveNewConversationProjectQuery("missing", projectIds), {
    value: null,
    canonicalHref: "/new",
  })
})

test("new conversation leaves an absent project query untouched", () => {
  assert.deepEqual(resolveNewConversationProjectQuery(undefined, projectIds), {
    value: null,
    canonicalHref: null,
  })
})

test("search accepts a normalized query without redirecting", () => {
  assert.deepEqual(resolveSearchQuery("compact maxsim"), {
    value: "compact maxsim",
    canonicalHref: null,
  })
})

test("search canonicalizes padded and repeated queries", () => {
  assert.deepEqual(resolveSearchQuery([" compact maxsim ", "ignored"]), {
    value: "compact maxsim",
    canonicalHref: "/search?q=compact%20maxsim",
  })
})

test("search removes a blank query", () => {
  assert.deepEqual(resolveSearchQuery("  "), {
    value: "",
    canonicalHref: "/search",
  })
})

test("search leaves an absent query untouched", () => {
  assert.deepEqual(resolveSearchQuery(undefined), {
    value: "",
    canonicalHref: null,
  })
})

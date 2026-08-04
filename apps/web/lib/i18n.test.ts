import assert from "node:assert/strict"
import test from "node:test"

import { createTranslator } from "@/lib/i18n"

test("shared UI labels follow the Chinese locale", () => {
  const t = createTranslator("zh-CN")

  assert.equal(t("ui.close"), "关闭")
  assert.equal(t("ui.sidebarTitle"), "侧边栏")
  assert.equal(t("ui.sidebarDescription"), "显示移动端侧边栏。")
  assert.equal(t("ui.toggleSidebar"), "切换侧边栏")
  assert.equal(t("ui.resizeSidebar"), "调整侧边栏宽度；点击折叠或展开")
  assert.equal(t("settings.nav.ariaLabel"), "设置导航")
  assert.equal(t("settings.webui.context"), "Adapter 上下文")
  assert.equal(t("settings.webui.notProbed"), "未探测")
  assert.equal(t("settings.webui.source.builtin"), "内置")
  assert.equal(t("settings.webui.nativeRendering"), "原生 Web 渲染")
  assert.equal(t("settings.webui.probeNotPassed"), "本会话尚未通过")
  assert.equal(
    t("settings.webui.readFailed"),
    "读取 WebUI Extension 状态失败。"
  )
  assert.equal(t("settings.resources.readFailed"), "读取 Pi 资源状态失败。")
  assert.equal(
    t("settings.resources.toggleEnabled", {
      scope: "Global",
      name: "npm:pi-notify",
    }),
    "Global npm:pi-notify 启用状态"
  )
  assert.equal(
    t("settings.resources.filteredSummary", { visible: 2, total: 19 }),
    "显示 2 / 19 项"
  )
  assert.equal(t("settings.mcp.status.connected"), "已连接")
  assert.equal(
    t("settings.mcp.lastConnected", { value: "2026-08-04 10:00:00Z" }),
    "最近连接：2026-08-04 10:00:00Z"
  )
  assert.equal(t("composer.reasoningEffort"), "推理强度")
  assert.equal(t("composer.reasoningLevel", { level: "max" }), "推理：max")
  assert.equal(t("composer.commands"), "命令")
  assert.equal(t("composer.send"), "发送")
  assert.equal(
    t("composer.image.remove", { name: "screen.png" }),
    "移除 screen.png"
  )
  assert.equal(t("composer.model.select"), "选择模型")
  assert.equal(t("workspace.nav.newConversation"), "新对话")
  assert.equal(t("home.heading.default"), "你想让 Pi 做什么？")
  assert.equal(
    t("search.summary", { query: "STREAM-3", count: 1 }),
    "“STREAM-3” 找到 1 个匹配结果"
  )
})

test("shared UI labels retain their English defaults", () => {
  const t = createTranslator("en-US")

  assert.equal(t("ui.close"), "Close")
  assert.equal(t("ui.sidebarTitle"), "Sidebar")
  assert.equal(t("ui.sidebarDescription"), "Displays the mobile sidebar.")
  assert.equal(t("ui.toggleSidebar"), "Toggle Sidebar")
  assert.equal(t("settings.nav.ariaLabel"), "Settings navigation")
  assert.equal(t("settings.webui.context"), "Adapter context")
  assert.equal(t("settings.webui.notProbed"), "Not probed")
  assert.equal(t("settings.webui.source.builtin"), "Built-in")
  assert.equal(t("settings.webui.nativeRendering"), "Native Web rendering")
  assert.equal(t("settings.webui.probeNotPassed"), "Not passed in this session")
  assert.equal(
    t("settings.webui.readFailed"),
    "Failed to read WebUI extension status."
  )
  assert.equal(
    t("settings.resources.readFailed"),
    "Failed to read Pi resource status."
  )
  assert.equal(
    t("settings.resources.toggleEnabled", {
      scope: "Global",
      name: "npm:pi-notify",
    }),
    "Global npm:pi-notify enabled state"
  )
  assert.equal(
    t("settings.resources.filteredSummary", { visible: 2, total: 19 }),
    "Showing 2 of 19 items"
  )
  assert.equal(t("settings.mcp.status.connected"), "Connected")
  assert.equal(
    t("settings.mcp.lastConnected", { value: "2026-08-04 10:00:00Z" }),
    "Last connected: 2026-08-04 10:00:00Z"
  )
  assert.equal(
    t("ui.resizeSidebar"),
    "Resize the sidebar; click to collapse or expand"
  )
  assert.equal(t("composer.reasoningEffort"), "Reasoning effort")
  assert.equal(t("composer.reasoningLevel", { level: "max" }), "Reasoning: max")
  assert.equal(t("composer.commands"), "Commands")
  assert.equal(t("composer.send"), "Send")
  assert.equal(
    t("composer.image.remove", { name: "screen.png" }),
    "Remove screen.png"
  )
  assert.equal(t("composer.model.select"), "Select model")
  assert.equal(t("workspace.nav.newConversation"), "New conversation")
  assert.equal(t("home.heading.default"), "What would you like Pi to do?")
  assert.equal(
    t("search.summary", { query: "STREAM-3", count: 1 }),
    "Matches for “STREAM-3”: 1"
  )
})

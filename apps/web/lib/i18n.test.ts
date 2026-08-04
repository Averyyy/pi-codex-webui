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
  assert.equal(t("composer.reasoningEffort"), "推理强度")
  assert.equal(t("composer.reasoningLevel", { level: "max" }), "推理：max")
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
    t("ui.resizeSidebar"),
    "Resize the sidebar; click to collapse or expand"
  )
  assert.equal(t("composer.reasoningEffort"), "Reasoning effort")
  assert.equal(t("composer.reasoningLevel", { level: "max" }), "Reasoning: max")
})

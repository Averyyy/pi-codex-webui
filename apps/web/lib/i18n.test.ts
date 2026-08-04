import assert from "node:assert/strict"
import test from "node:test"

import { createTranslator } from "@/lib/i18n"

test("shared UI labels follow the Chinese locale", () => {
  const t = createTranslator("zh-CN")

  assert.equal(t("ui.close"), "关闭")
  assert.equal(t("ui.skipToMain"), "跳到主要内容")
  assert.equal(t("ui.sidebarTitle"), "侧边栏")
  assert.equal(t("ui.sidebarDescription"), "显示移动端侧边栏。")
  assert.equal(t("ui.toggleSidebar"), "切换侧边栏")
  assert.equal(t("ui.resizeSidebar"), "调整侧边栏宽度；点击折叠或展开")
  assert.equal(t("settings.nav.ariaLabel"), "设置导航")
  assert.equal(t("settings.nav.packages"), "软件包")
  assert.equal(t("settings.nav.extensions"), "扩展")
  assert.equal(t("settings.nav.webuiExtensions"), "WebUI 扩展")
  assert.equal(t("settings.nav.skills"), "技能")
  assert.equal(t("settings.nav.developer"), "开发者")
  assert.equal(t("settings.page.packages.title"), "软件包")
  assert.equal(t("settings.page.extensions.title"), "扩展")
  assert.equal(t("settings.page.webuiExtensions.title"), "WebUI 扩展")
  assert.equal(t("settings.page.skills.title"), "技能")
  assert.equal(t("settings.page.developer.title"), "开发者")
  assert.equal(t("settings.webui.context"), "Adapter 上下文")
  assert.equal(t("settings.webui.notProbed"), "未探测")
  assert.equal(t("settings.webui.source.builtin"), "内置")
  assert.equal(t("settings.webui.nativeRendering"), "原生 Web 渲染")
  assert.equal(t("settings.webui.probeNotPassed"), "本会话尚未通过")
  assert.equal(t("settings.webui.searchLabel"), "搜索 Adapter")
  assert.equal(t("session.extension.defaultTitle"), "Pi 扩展")
  assert.equal(
    t("session.extension.nativeUnavailable"),
    "原生 Adapter 不可用，正在打开 Pi TUI…"
  )
  assert.equal(t("settings.webui.readFailed"), "读取 WebUI 扩展状态失败。")
  assert.equal(t("settings.packages.source"), "软件包来源")
  assert.equal(t("settings.packages.itemCountOne", { count: 1 }), "1 项")
  assert.equal(t("settings.resources.global"), "全局")
  assert.equal(t("settings.resources.project"), "当前项目")
  assert.equal(t("settings.resources.source.explicitPath"), "显式路径")
  assert.equal(t("settings.mcp.context"), "MCP 上下文")
  assert.equal(t("settings.mcp.serverCountMany", { count: 2 }), "2 项")
  assert.equal(t("settings.mcpForm.environment"), "环境变量")
  assert.equal(t("settings.valueEditor.secret"), "敏感值")
  assert.equal(t("settings.resources.readFailed"), "读取 Pi 资源状态失败。")
  assert.equal(
    t("settings.resources.toggleEnabled", {
      scope: t("settings.resources.global"),
      name: "npm:pi-notify",
    }),
    "全局 npm:pi-notify 启用状态"
  )
  assert.equal(
    t("settings.resources.filteredSummary", { visible: 2, total: 19 }),
    "显示 2 / 19 项"
  )
  assert.equal(t("settings.mcp.status.connected"), "已连接")
  assert.equal(
    t("settings.common.conflict"),
    "设置已在其他页面更新；当前修改已保留，请检查后重试。"
  )
  assert.equal(
    t("settings.provider.deleteModel", { model: "audit-model" }),
    "删除模型 audit-model"
  )
  assert.equal(t("settings.runtime.sessionCountOne", { count: 1 }), "1 个会话")
  assert.equal(t("settings.runtime.sessionCountMany", { count: 2 }), "2 个会话")
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
  assert.equal(t("session.transcript.settingsCountOne", { count: 1 }), "1 项")
  assert.equal(t("session.subagents.status.running"), "运行中")
  assert.equal(t("session.workspace.openFinder"), "在 Finder 中打开")
  assert.equal(t("workspace.nav.newConversation"), "新对话")
  assert.equal(t("workspace.project.archiveConversations"), "归档对话")
  assert.equal(
    t("workspace.project.archiveDescriptionOne", { count: "1" }),
    "将从导航中移除 1 个对话；如果它正在运行，会先停止。项目目录和 Pi session 文件不会删除。"
  )
  assert.equal(
    t("workspace.project.archiveConfirmMany", { count: "12" }),
    "归档 12 个对话"
  )
  assert.equal(t("home.heading.default"), "你想让 Pi 做什么？")
  assert.equal(t("search.submitting"), "搜索中…")
  assert.equal(
    t("search.summary", { query: "STREAM-3", count: 1 }),
    "“STREAM-3” 找到 1 个匹配结果"
  )
})

test("shared UI labels retain their English defaults", () => {
  const t = createTranslator("en-US")

  assert.equal(t("ui.close"), "Close")
  assert.equal(t("ui.skipToMain"), "Skip to main content")
  assert.equal(t("ui.sidebarTitle"), "Sidebar")
  assert.equal(t("ui.sidebarDescription"), "Displays the mobile sidebar.")
  assert.equal(t("ui.toggleSidebar"), "Toggle Sidebar")
  assert.equal(t("settings.nav.ariaLabel"), "Settings navigation")
  assert.equal(t("settings.nav.packages"), "Packages")
  assert.equal(t("settings.nav.extensions"), "Extensions")
  assert.equal(t("settings.nav.webuiExtensions"), "WebUI Extensions")
  assert.equal(t("settings.nav.skills"), "Skills")
  assert.equal(t("settings.nav.developer"), "Developer")
  assert.equal(t("settings.page.packages.title"), "Packages")
  assert.equal(t("settings.page.extensions.title"), "Extensions")
  assert.equal(t("settings.page.webuiExtensions.title"), "WebUI Extensions")
  assert.equal(t("settings.page.skills.title"), "Skills")
  assert.equal(t("settings.page.developer.title"), "Developer")
  assert.equal(t("settings.webui.context"), "Adapter context")
  assert.equal(t("settings.webui.notProbed"), "Not probed")
  assert.equal(t("settings.webui.source.builtin"), "Built-in")
  assert.equal(t("settings.webui.nativeRendering"), "Native Web rendering")
  assert.equal(t("settings.webui.probeNotPassed"), "Not passed in this session")
  assert.equal(t("settings.webui.searchLabel"), "Search adapters")
  assert.equal(t("session.extension.defaultTitle"), "Pi extension")
  assert.equal(
    t("session.extension.nativeUnavailable"),
    "Native adapter unavailable. Opening Pi TUI…"
  )
  assert.equal(
    t("settings.webui.readFailed"),
    "Failed to read WebUI extension status."
  )
  assert.equal(t("settings.packages.source"), "Package source")
  assert.equal(t("settings.packages.itemCountOne", { count: 1 }), "1 item")
  assert.equal(t("settings.packages.itemCountMany", { count: 2 }), "2 items")
  assert.equal(
    t("settings.resources.searchPlaceholder", { kind: "extensions" }),
    "Search extensions by name, package, or path"
  )
  assert.equal(t("settings.resources.source.explicitPath"), "Explicit path")
  assert.equal(t("settings.mcp.serverCountOne", { count: 1 }), "1 server")
  assert.equal(t("settings.mcp.serverCountMany", { count: 2 }), "2 servers")
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
    t("settings.common.conflict"),
    "Settings changed on another page. Your edits were kept; review them and try again."
  )
  assert.equal(
    t("settings.provider.deleteModel", { model: "audit-model" }),
    "Delete model audit-model"
  )
  assert.equal(t("settings.runtime.sessionCountOne", { count: 1 }), "1 session")
  assert.equal(
    t("settings.runtime.sessionCountMany", { count: 2 }),
    "2 sessions"
  )
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
  assert.equal(
    t("session.transcript.settingsCountOne", { count: 1 }),
    "1 change"
  )
  assert.equal(t("session.subagents.toolUsesOne", { count: 1 }), "1 tool use")
  assert.equal(t("session.workspace.openFinder"), "Open in Finder")
  assert.equal(t("workspace.nav.newConversation"), "New conversation")
  assert.equal(
    t("workspace.project.archiveConversations"),
    "Archive conversations"
  )
  assert.equal(
    t("workspace.project.archiveDescriptionOne", { count: "1" }),
    "This removes 1 conversation from navigation and stops it if it is running. The project folder and Pi session files are kept."
  )
  assert.equal(
    t("workspace.project.archiveConfirmMany", { count: "1,234" }),
    "Archive 1,234 conversations"
  )
  assert.equal(t("home.heading.default"), "What would you like Pi to do?")
  assert.equal(t("search.submitting"), "Searching…")
  assert.equal(
    t("search.summary", { query: "STREAM-3", count: 1 }),
    "Matches for “STREAM-3”: 1"
  )
})

test("project and review labels follow the selected locale", () => {
  const zh = createTranslator("zh-CN")
  const en = createTranslator("en-US")

  assert.equal(zh("project.tools.ariaLabel"), "项目工具")
  assert.equal(en("project.tools.ariaLabel"), "Project tools")
  assert.equal(zh("project.sessions.messageCount", { count: 12 }), "12 条消息")
  assert.equal(
    en("project.sessions.messageCount", { count: 12 }),
    "12 messages"
  )
  assert.equal(
    en("project.sessions.messageCountOne", { count: 1 }),
    "1 message"
  )
  assert.equal(zh("project.files.type.directory"), "目录")
  assert.equal(en("project.files.type.directory"), "directory")
  assert.equal(zh("project.files.root"), "根目录")
  assert.equal(en("project.files.root"), "Root")
  assert.equal(
    zh("project.git.divergence", { ahead: 2, behind: 1 }),
    "领先 2 · 落后 1"
  )
  assert.equal(
    en("project.git.divergence", { ahead: 2, behind: 1 }),
    "ahead 2 · behind 1"
  )
  assert.equal(
    en("project.git.changedSummaryOne", { count: 1 }),
    "1 Git status entry."
  )
  assert.equal(en("project.review.changeCountOne", { count: 1 }), "1 change")
  assert.equal(
    en("project.review.showMore", { count: 1, remaining: 1 }),
    "Show 1 more (1 remaining)"
  )
  assert.equal(
    en("project.review.diffAriaLabel", { path: "src/example.ts" }),
    "Unified diff for src/example.ts"
  )
})

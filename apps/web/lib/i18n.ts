export const locales = ["zh-CN", "en-US"] as const
export type Locale = (typeof locales)[number]

export const DEFAULT_LOCALE: Locale = "zh-CN"

const messages = {
  "ui.close": { "zh-CN": "关闭", "en-US": "Close" },
  "ui.skipToMain": {
    "zh-CN": "跳到主要内容",
    "en-US": "Skip to main content",
  },
  "ui.sidebarTitle": { "zh-CN": "侧边栏", "en-US": "Sidebar" },
  "ui.sidebarDescription": {
    "zh-CN": "显示移动端侧边栏。",
    "en-US": "Displays the mobile sidebar.",
  },
  "ui.toggleSidebar": {
    "zh-CN": "切换侧边栏",
    "en-US": "Toggle Sidebar",
  },
  "ui.resizeSidebar": {
    "zh-CN": "调整侧边栏宽度；点击折叠或展开",
    "en-US": "Resize the sidebar; click to collapse or expand",
  },

  "app.notFound.title": {
    "zh-CN": "页面不存在",
    "en-US": "Page not found",
  },
  "app.notFound.description": {
    "zh-CN": "请求的页面不存在，或已被移除。",
    "en-US": "The requested page does not exist or has been removed.",
  },
  "app.notFound.home": { "zh-CN": "返回首页", "en-US": "Return home" },
  "app.error.title": {
    "zh-CN": "页面加载失败",
    "en-US": "This page could not be loaded",
  },
  "app.error.description": {
    "zh-CN": "发生了意外错误。你可以重试，或返回首页。",
    "en-US": "An unexpected error occurred. Try again or return home.",
  },
  "app.error.retry": { "zh-CN": "重试", "en-US": "Try again" },
  "app.error.reference": {
    "zh-CN": "错误参考：{digest}",
    "en-US": "Error reference: {digest}",
  },

  "composer.reasoningEffort": {
    "zh-CN": "推理强度",
    "en-US": "Reasoning effort",
  },
  "composer.reasoningLevel": {
    "zh-CN": "推理：{level}",
    "en-US": "Reasoning: {level}",
  },
  "composer.reasoningShortcut": {
    "zh-CN": "{shortcut} 切换推理强度",
    "en-US": "{shortcut} cycles reasoning effort",
  },
  "composer.reasoningUnavailable": {
    "zh-CN": "选择的 thinking level 不再可用。",
    "en-US": "The selected thinking level is no longer available.",
  },
  "composer.reasoningInvalid": {
    "zh-CN": "当前 reasoning effort {level} 不在可选档位中。",
    "en-US": "The current reasoning effort {level} is not available.",
  },
  "composer.reasoningNoAlternative": {
    "zh-CN": "当前模型没有可切换的 reasoning effort。",
    "en-US": "The current model has no alternative reasoning effort.",
  },
  "composer.commands": { "zh-CN": "命令", "en-US": "Commands" },
  "composer.commands.noMatches": {
    "zh-CN": "没有匹配的命令",
    "en-US": "No matching commands",
  },
  "composer.send": { "zh-CN": "发送", "en-US": "Send" },
  "composer.placeholder": {
    "zh-CN": "向 Pi 发送消息",
    "en-US": "Send a message to Pi",
  },
  "composer.ariaLabel": {
    "zh-CN": "向 Pi 发送消息",
    "en-US": "Message Pi",
  },
  "composer.image.label": { "zh-CN": "图片", "en-US": "Image" },
  "composer.image.add": {
    "zh-CN": "添加到当前消息",
    "en-US": "Add to the current message",
  },
  "composer.image.addPendingValidation": {
    "zh-CN": "添加到当前消息；发送时验证模型",
    "en-US": "Add now; model support is checked when sending",
  },
  "composer.image.unsupported": {
    "zh-CN": "当前模型不支持图片",
    "en-US": "The current model does not support images",
  },
  "composer.image.unsupportedSentence": {
    "zh-CN": "当前模型不支持图片。",
    "en-US": "The current model does not support images.",
  },
  "composer.image.sending": {
    "zh-CN": "消息正在发送，请稍后添加图片。",
    "en-US": "The message is being sent. Add images after it finishes.",
  },
  "composer.image.unsupportedAttached": {
    "zh-CN": "当前模型不支持已添加的图片。请移除图片或切换模型。",
    "en-US":
      "The current model does not support the attached images. Remove them or switch models.",
  },
  "composer.image.readFailed": {
    "zh-CN": "无法读取图片 {name}。",
    "en-US": "Could not read image {name}.",
  },
  "composer.image.invalid": {
    "zh-CN": "{name} 不是浏览器可读取的图片。",
    "en-US": "{name} is not an image the browser can read.",
  },
  "composer.image.maximum": {
    "zh-CN": "每条消息最多添加 {count} 张图片。",
    "en-US": "Each message can include up to {count} images.",
  },
  "composer.image.tooLarge": {
    "zh-CN": "图片 {name} 太大，无法添加。",
    "en-US": "Image {name} is too large to add.",
  },
  "composer.image.remove": {
    "zh-CN": "移除 {name}",
    "en-US": "Remove {name}",
  },
  "composer.model.select": {
    "zh-CN": "选择模型",
    "en-US": "Select model",
  },
  "composer.model.unavailable": {
    "zh-CN": "选择的模型不再可用。",
    "en-US": "The selected model is no longer available.",
  },
  "composer.model.ariaLabel": { "zh-CN": "模型", "en-US": "Model" },
  "composer.model.manage": {
    "zh-CN": "管理 Provider / Model scope",
    "en-US": "Manage providers and model scope",
  },

  "session.context.standalone": {
    "zh-CN": "独立任务",
    "en-US": "Standalone task",
  },
  "session.context.project": { "zh-CN": "项目", "en-US": "Project" },
  "session.workspaceUnavailable": {
    "zh-CN": "工作区目录不可用。",
    "en-US": "The workspace directory is unavailable.",
  },
  "session.readOnlyComposer": {
    "zh-CN": "只读历史 · Runtime 未启动",
    "en-US": "Read-only history · Runtime not started",
  },
  "session.readOnlyTitle": {
    "zh-CN": "历史会话仅可阅读",
    "en-US": "This historical conversation is read-only",
  },
  "session.readOnlyDescription": {
    "zh-CN":
      "原工作目录已不存在，因此不会启动 Runtime，也不会读取 Files、Git 或项目资源。",
    "en-US":
      "The original working directory no longer exists, so the Runtime, Files, Git, and project resources are unavailable.",
  },
  "session.tab.review": { "zh-CN": "审阅", "en-US": "Review" },
  "session.tab.files": { "zh-CN": "文件", "en-US": "Files" },
  "session.tab.terminal": { "zh-CN": "终端", "en-US": "Terminal" },
  "session.tab.subagents": {
    "zh-CN": "子智能体",
    "en-US": "Subagents",
  },
  "session.workspace.sidebar": {
    "zh-CN": "会话侧栏",
    "en-US": "Conversation sidebar",
  },
  "session.workspace.closeTab": {
    "zh-CN": "关闭{name}标签页",
    "en-US": "Close {name} tab",
  },
  "session.workspace.addTab": {
    "zh-CN": "添加会话侧栏标签页",
    "en-US": "Add a conversation sidebar tab",
  },
  "session.workspace.closeSidebar": {
    "zh-CN": "关闭会话侧栏",
    "en-US": "Close the conversation sidebar",
  },
  "session.workspace.view": {
    "zh-CN": "{name}视图",
    "en-US": "{name} view",
  },
  "session.workspace.sidebarView": {
    "zh-CN": "会话侧栏视图",
    "en-US": "Conversation sidebar view",
  },
  "session.workspace.emptyTitle": {
    "zh-CN": "添加标签页",
    "en-US": "Add a tab",
  },
  "session.workspace.emptyDescription": {
    "zh-CN": "从上方菜单添加可用视图。",
    "en-US": "Add an available view from the menu above.",
  },
  "session.workspace.bottomTerminal": {
    "zh-CN": "底部终端",
    "en-US": "Bottom terminal",
  },
  "session.workspace.toggleBottomTerminal": {
    "zh-CN": "切换底部终端",
    "en-US": "Toggle the bottom terminal",
  },
  "session.workspace.gitSummary": {
    "zh-CN": "打开 {branch} 的 Git 工作区审阅",
    "en-US": "Open Git working tree review for {branch}",
  },
  "session.workspace.gitFilesShort": {
    "zh-CN": "文件",
    "en-US": "files",
  },
  "session.workspace.toggleSidebar": {
    "zh-CN": "切换会话侧栏",
    "en-US": "Toggle the conversation sidebar",
  },
  "session.workspace.moveTerminal": {
    "zh-CN": "将终端移到侧边栏",
    "en-US": "Move the terminal to the sidebar",
  },
  "session.workspace.closeTerminal": {
    "zh-CN": "关闭终端",
    "en-US": "Close the terminal",
  },
  "session.workspace.sheetDescription": {
    "zh-CN": "查看代码审阅、项目文件、终端或子智能体。",
    "en-US": "View code review, project files, the terminal, or subagents.",
  },
  "session.workspace.closeTerminalFailed": {
    "zh-CN": "无法关闭终端。",
    "en-US": "Could not close the terminal.",
  },
  "session.workspace.openProjectFailed": {
    "zh-CN": "无法打开项目目录。",
    "en-US": "Could not open the project directory.",
  },
  "session.workspace.openFinder": {
    "zh-CN": "在 Finder 中打开",
    "en-US": "Open in Finder",
  },
  "session.workspace.openFileExplorer": {
    "zh-CN": "在文件资源管理器中打开",
    "en-US": "Open in File Explorer",
  },
  "session.terminal.operationFailed": {
    "zh-CN": "终端操作失败。",
    "en-US": "Terminal operation failed.",
  },
  "session.terminal.processExited": {
    "zh-CN": "进程已退出：{code}",
    "en-US": "Process exited: {code}",
  },
  "session.terminal.ariaLabel": {
    "zh-CN": "项目终端",
    "en-US": "Project terminal",
  },
  "session.status.stopped": { "zh-CN": "未激活", "en-US": "Inactive" },
  "session.status.starting": { "zh-CN": "启动中", "en-US": "Starting" },
  "session.status.ready": { "zh-CN": "就绪", "en-US": "Ready" },
  "session.status.busy": { "zh-CN": "运行中", "en-US": "Running" },
  "session.status.stopping": { "zh-CN": "停止中", "en-US": "Stopping" },
  "session.status.crashed": { "zh-CN": "已崩溃", "en-US": "Crashed" },
  "session.runtime.operationFailed": {
    "zh-CN": "Pi runtime 操作失败（HTTP {status}）。",
    "en-US": "Pi runtime operation failed (HTTP {status}).",
  },
  "session.runtime.emptyResponse": {
    "zh-CN": "Pi runtime 返回了空响应。",
    "en-US": "Pi runtime returned an empty response.",
  },
  "session.readFailed": {
    "zh-CN": "标记会话为已读失败（HTTP {status}）。",
    "en-US": "Failed to mark the conversation as read (HTTP {status}).",
  },
  "session.readInvalidResponse": {
    "zh-CN": "服务器返回了其他会话的已读状态。",
    "en-US": "The server returned read status for a different conversation.",
  },
  "session.runtime.imageOnlyMessage": {
    "zh-CN": "请查看附加图片。",
    "en-US": "Please review the attached image.",
  },
  "session.runtime.retry": {
    "zh-CN": "重试 {attempt}/{max}",
    "en-US": "Retry {attempt}/{max}",
  },
  "session.runtime.completedTitle": {
    "zh-CN": "Pi 已完成",
    "en-US": "Pi finished",
  },
  "session.runtime.completedBody": {
    "zh-CN": "当前 Agent 轮次已结束。",
    "en-US": "The current agent turn has finished.",
  },
  "session.runtime.crashMessage": {
    "zh-CN": "Pi worker 意外退出；历史 JSONL 仍可读取。",
    "en-US":
      "The Pi worker exited unexpectedly; the historical JSONL remains readable.",
  },
  "session.runtime.crashTitle": {
    "zh-CN": "Pi Runtime 已崩溃",
    "en-US": "Pi Runtime crashed",
  },
  "session.runtime.crashBody": {
    "zh-CN": "历史内容仍可读取，可回到 session 显式重启。",
    "en-US":
      "Historical content remains readable. Return to the conversation to restart explicitly.",
  },
  "session.runtime.connectionLost": {
    "zh-CN": "实时连接已断开；浏览器正在自动重连。",
    "en-US":
      "The live connection was interrupted; the browser is reconnecting automatically.",
  },
  "session.runtime.reloadSuccess": {
    "zh-CN": "已重新加载 Pi 扩展、技能、提示词和上下文文件。",
    "en-US": "Reloaded Pi extensions, skills, prompts, and context files.",
  },
  "session.runtime.extensionResponseFailed": {
    "zh-CN": "Extension UI 响应失败。",
    "en-US": "The Extension UI response failed.",
  },
  "session.runtime.tuiSyncFailed": {
    "zh-CN": "TUI surfaces 同步失败（HTTP {status}）。",
    "en-US": "TUI surface sync failed (HTTP {status}).",
  },
  "session.runtime.extensionSyncFailed": {
    "zh-CN": "Extension UI 同步失败（HTTP {status}）。",
    "en-US": "Extension UI sync failed (HTTP {status}).",
  },
  "session.runtime.extensionInvalidResponse": {
    "zh-CN": "Extension UI 同步返回了无效响应。",
    "en-US": "Extension UI sync returned an invalid response.",
  },
  "session.runtime.extensionInvalidRequest": {
    "zh-CN": "Extension UI 同步返回了无效请求。",
    "en-US": "Extension UI sync returned an invalid request.",
  },
  "session.runtime.stateSyncFailed": {
    "zh-CN": "Runtime 状态同步失败（HTTP {status}）。",
    "en-US": "Runtime state sync failed (HTTP {status}).",
  },
  "session.runtime.extensionCancel": {
    "zh-CN": "取消",
    "en-US": "Cancel",
  },
  "session.runtime.extensionConfirm": {
    "zh-CN": "确定",
    "en-US": "Confirm",
  },
  "session.extension.defaultTitle": {
    "zh-CN": "Pi 扩展",
    "en-US": "Pi extension",
  },
  "session.extension.viewDescription": {
    "zh-CN": "交互式 WebUI 扩展视图。",
    "en-US": "Interactive WebUI extension view.",
  },
  "session.extension.panelDescription": {
    "zh-CN": "交互式 WebUI 扩展面板。",
    "en-US": "Interactive WebUI extension panel.",
  },
  "session.extension.tuiDescription": {
    "zh-CN": "交互式 Pi 终端界面。",
    "en-US": "Interactive Pi terminal surface.",
  },
  "session.extension.tuiLabel": { "zh-CN": "Pi TUI", "en-US": "Pi TUI" },
  "session.extension.nativeUnavailable": {
    "zh-CN": "原生 Adapter 不可用，正在打开 Pi TUI…",
    "en-US": "Native adapter unavailable. Opening Pi TUI…",
  },
  "session.extension.clientStatusFailed": {
    "zh-CN": "WebUI client 状态上报失败（HTTP {status}）。",
    "en-US": "WebUI client status failed (HTTP {status}).",
  },
  "session.extension.actionFailed": {
    "zh-CN": "WebUI 扩展操作失败。",
    "en-US": "WebUI extension action failed.",
  },
  "session.extension.viewsSyncFailed": {
    "zh-CN": "WebUI 视图同步失败（HTTP {status}）。",
    "en-US": "WebUI views sync failed (HTTP {status}).",
  },
  "session.extension.catalogSyncFailed": {
    "zh-CN": "WebUI 扩展目录同步失败（HTTP {status}）。",
    "en-US": "WebUI extension catalog failed (HTTP {status}).",
  },
  "session.command.goal": { "zh-CN": "目标", "en-US": "Goal" },
  "session.command.goalDescription": {
    "zh-CN": "让 Pi 持续工作直到目标完成",
    "en-US": "Keep Pi working until the goal is complete",
  },
  "session.command.compact": { "zh-CN": "压缩", "en-US": "Compact" },
  "session.command.compactDescription": {
    "zh-CN": "主动压缩",
    "en-US": "Compact the context now",
  },
  "session.command.reload": {
    "zh-CN": "重新加载",
    "en-US": "Reload",
  },
  "session.command.reloadDescription": {
    "zh-CN": "重新加载 Pi 扩展、技能、提示词和上下文",
    "en-US": "Reload Pi extensions, skills, prompts, and context",
  },
  "session.command.tree": { "zh-CN": "会话树", "en-US": "Conversation tree" },
  "session.command.treeDescription": {
    "zh-CN": "查看并切换会话分支",
    "en-US": "View and switch conversation branches",
  },
  "session.runtime.imageReading": {
    "zh-CN": "正在读取图片…",
    "en-US": "Reading images…",
  },
  "session.runtime.queueMode": {
    "zh-CN": "消息队列方式",
    "en-US": "Message queue behavior",
  },
  "session.runtime.followUp": {
    "zh-CN": "完成后继续",
    "en-US": "Continue after completion",
  },
  "session.runtime.steer": {
    "zh-CN": "当前轮次补充",
    "en-US": "Add to the current turn",
  },
  "session.runtime.abort": { "zh-CN": "终止", "en-US": "Stop" },
  "session.runtime.compactContext": {
    "zh-CN": "压缩上下文",
    "en-US": "Compact context",
  },
  "session.runtime.restart": {
    "zh-CN": "重新启动 Runtime",
    "en-US": "Restart Runtime",
  },
  "session.goal.startTitle": {
    "zh-CN": "启动目标",
    "en-US": "Start a goal",
  },
  "session.goal.startDescription": {
    "zh-CN": "Pi 会持续推进并验证结果，直到完成、暂停或遇到真正的阻塞。",
    "en-US":
      "Pi will keep working and validating until it completes, pauses, or reaches a genuine blocker.",
  },
  "session.goal.objectivePlaceholder": {
    "zh-CN": "描述需要完成的目标",
    "en-US": "Describe the goal to complete",
  },
  "session.goal.objective": { "zh-CN": "目标内容", "en-US": "Goal" },
  "session.goal.tokenBudget": {
    "zh-CN": "Token 预算",
    "en-US": "Token budget",
  },
  "session.goal.tokenBudgetOptional": {
    "zh-CN": "Token 预算（可选）",
    "en-US": "Token budget (optional)",
  },
  "session.goal.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "session.goal.start": { "zh-CN": "启动目标", "en-US": "Start goal" },
  "session.goal.status.active": {
    "zh-CN": "进行中的目标",
    "en-US": "Active goal",
  },
  "session.goal.status.queued": {
    "zh-CN": "排队中的目标",
    "en-US": "Queued goal",
  },
  "session.goal.status.paused": {
    "zh-CN": "已暂停的目标",
    "en-US": "Paused goal",
  },
  "session.goal.status.blocked": {
    "zh-CN": "受阻的目标",
    "en-US": "Blocked goal",
  },
  "session.goal.status.usageLimited": {
    "zh-CN": "用量受限的目标",
    "en-US": "Usage-limited goal",
  },
  "session.goal.status.budgetLimited": {
    "zh-CN": "预算已用尽的目标",
    "en-US": "Budget-limited goal",
  },
  "session.goal.status.complete": {
    "zh-CN": "已完成的目标",
    "en-US": "Completed goal",
  },
  "session.goal.edit": { "zh-CN": "编辑目标", "en-US": "Edit goal" },
  "session.goal.pause": { "zh-CN": "暂停目标", "en-US": "Pause goal" },
  "session.goal.resume": { "zh-CN": "恢复目标", "en-US": "Resume goal" },
  "session.goal.clear": { "zh-CN": "清除目标", "en-US": "Clear goal" },
  "session.goal.expand": { "zh-CN": "展开目标", "en-US": "Expand goal" },
  "session.goal.collapse": { "zh-CN": "收起目标", "en-US": "Collapse goal" },
  "session.goal.iteration": {
    "zh-CN": "第 {count} 轮",
    "en-US": "Iteration {count}",
  },
  "session.goal.tokensUsed": {
    "zh-CN": "已用 {count} tokens",
    "en-US": "{count} tokens used",
  },
  "session.goal.budget": {
    "zh-CN": "预算 {count}",
    "en-US": "Budget {count}",
  },
  "session.goal.queue": {
    "zh-CN": "队列 {count}",
    "en-US": "Queue {count}",
  },
  "session.goal.save": { "zh-CN": "保存", "en-US": "Save" },
  "session.queue.title": {
    "zh-CN": "待处理消息",
    "en-US": "Pending messages",
  },
  "session.queue.description": {
    "zh-CN": "{count} 条消息将按发送顺序处理",
    "en-US": "{count} messages will be processed in send order",
  },
  "session.queue.descriptionOne": {
    "zh-CN": "{count} 条消息将按发送顺序处理",
    "en-US": "{count} message will be processed in send order",
  },
  "session.queue.steering": { "zh-CN": "引导中", "en-US": "Steering" },
  "session.queue.queued": { "zh-CN": "排队", "en-US": "Queued" },
  "session.queue.steer": { "zh-CN": "引导", "en-US": "Steer" },
  "session.queue.editAria": {
    "zh-CN": "编辑第 {index} 条待处理消息",
    "en-US": "Edit pending message {index}",
  },
  "session.queue.deleteAria": {
    "zh-CN": "删除第 {index} 条待处理消息",
    "en-US": "Delete pending message {index}",
  },
  "session.queue.editTitle": {
    "zh-CN": "编辑待处理消息",
    "en-US": "Edit pending message",
  },
  "session.queue.editDescription": {
    "zh-CN": "保存后仍保留这条消息原来的排队或引导状态。",
    "en-US": "Saving preserves whether this message is queued or steering.",
  },
  "session.queue.message": { "zh-CN": "消息内容", "en-US": "Message" },
  "session.queue.noLongerAvailable": {
    "zh-CN": "这条消息已经被处理，不能再编辑。",
    "en-US":
      "This message has already been processed and can no longer be edited.",
  },
  "session.queue.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "session.queue.save": { "zh-CN": "保存", "en-US": "Save" },
  "session.queue.conflict": {
    "zh-CN": "待处理消息已变化，请根据最新队列重试。",
    "en-US":
      "The pending messages changed. Review the latest queue and try again.",
  },
  "session.compaction.running": {
    "zh-CN": "正在压缩上下文",
    "en-US": "Compacting context",
  },
  "session.compaction.complete": {
    "zh-CN": "上下文已压缩",
    "en-US": "Context compacted",
  },
  "session.message.editSent": {
    "zh-CN": "编辑已发送消息",
    "en-US": "Edit sent message",
  },
  "session.message.previousBranch": {
    "zh-CN": "上一条消息分支",
    "en-US": "Previous message branch",
  },
  "session.message.nextBranch": {
    "zh-CN": "下一条消息分支",
    "en-US": "Next message branch",
  },
  "session.message.edit": { "zh-CN": "编辑消息", "en-US": "Edit message" },
  "session.message.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "session.message.send": { "zh-CN": "发送", "en-US": "Send" },
  "session.transcript.failed": { "zh-CN": "失败", "en-US": "Failed" },
  "session.transcript.running": { "zh-CN": "运行中", "en-US": "Running" },
  "session.transcript.complete": { "zh-CN": "完成", "en-US": "Complete" },
  "session.transcript.expandShell": {
    "zh-CN": "展开 shell 详情",
    "en-US": "Expand shell details",
  },
  "session.transcript.settingsChanges": {
    "zh-CN": "会话设置变更",
    "en-US": "Conversation setting changes",
  },
  "session.transcript.settingsCount": {
    "zh-CN": "{count} 项",
    "en-US": "{count} changes",
  },
  "session.transcript.settingsCountOne": {
    "zh-CN": "{count} 项",
    "en-US": "{count} change",
  },
  "session.transcript.expandSettings": {
    "zh-CN": "展开会话设置变更",
    "en-US": "Expand conversation setting changes",
  },
  "session.transcript.thought": { "zh-CN": "思考", "en-US": "Thought" },
  "session.transcript.thinking": {
    "zh-CN": "思考中",
    "en-US": "Thinking",
  },
  "session.transcript.redactedThought": {
    "zh-CN": "已脱敏思考",
    "en-US": "Redacted thought",
  },
  "session.transcript.expandThought": {
    "zh-CN": "展开思考",
    "en-US": "Expand thought",
  },
  "session.transcript.expandThinking": {
    "zh-CN": "展开正在生成的思考",
    "en-US": "Expand the active thought",
  },
  "session.transcript.expandRedactedThought": {
    "zh-CN": "展开已脱敏思考",
    "en-US": "Expand redacted thought",
  },
  "session.transcript.unsupportedPart": {
    "zh-CN": "未支持的 content part：{type}",
    "en-US": "Unsupported content part: {type}",
  },
  "session.tool.expand": {
    "zh-CN": "展开 {name} 详情",
    "en-US": "Expand {name} details",
  },
  "session.tool.query": { "zh-CN": "查询", "en-US": "Query" },
  "session.tool.target": { "zh-CN": "目标", "en-US": "Target" },
  "session.tool.liveResult": {
    "zh-CN": "实时结果",
    "en-US": "Live result",
  },
  "session.tool.result": { "zh-CN": "结果", "en-US": "Result" },
  "session.tool.arguments": { "zh-CN": "参数", "en-US": "Arguments" },
  "session.fileMutation.write": { "zh-CN": "write", "en-US": "write" },
  "session.fileMutation.edit": { "zh-CN": "edit", "en-US": "edit" },
  "session.fileMutation.insert": { "zh-CN": "insert", "en-US": "insert" },
  "session.fileMutation.replace": {
    "zh-CN": "replace",
    "en-US": "replace",
  },
  "session.fileMutation.noPath": {
    "zh-CN": "未提供文件路径",
    "en-US": "No file path provided",
  },
  "session.streaming.reply": {
    "zh-CN": "正在生成的回复",
    "en-US": "Response in progress",
  },
  "session.streaming.generating": {
    "zh-CN": "正在生成",
    "en-US": "Generating",
  },
  "session.streaming.activeTools": {
    "zh-CN": "{count} 个工具",
    "en-US": "{count} tools",
  },
  "session.streaming.executing": {
    "zh-CN": "正在执行 {name}",
    "en-US": "Running {name}",
  },
  "session.web.query": { "zh-CN": "查询", "en-US": "Queries" },
  "session.web.sources": { "zh-CN": "来源", "en-US": "Sources" },
  "session.web.filter": { "zh-CN": "筛选", "en-US": "Curation" },
  "session.web.searchId": { "zh-CN": "搜索 ID", "en-US": "Search ID" },
  "session.web.contentId": { "zh-CN": "内容 ID", "en-US": "Content ID" },
  "session.web.summaryModel": {
    "zh-CN": "摘要模型",
    "en-US": "Summary model",
  },
  "session.web.webSearch": { "zh-CN": "网络搜索", "en-US": "Web search" },
  "session.web.noQuery": {
    "zh-CN": "未提供查询",
    "en-US": "No query provided",
  },
  "session.web.queryCount": {
    "zh-CN": "{count} 个查询",
    "en-US": "{count} queries",
  },
  "session.web.queryCountOne": {
    "zh-CN": "{count} 个查询",
    "en-US": "{count} query",
  },
  "session.web.success": {
    "zh-CN": "{value} 成功",
    "en-US": "{value} succeeded",
  },
  "session.web.sourceCount": {
    "zh-CN": "{count} 个",
    "en-US": "{count} sources",
  },
  "session.web.sourceCountOne": {
    "zh-CN": "{count} 个",
    "en-US": "{count} source",
  },
  "session.web.address": { "zh-CN": "地址", "en-US": "Addresses" },
  "session.web.content": { "zh-CN": "内容", "en-US": "Content" },
  "session.web.images": { "zh-CN": "图像", "en-US": "Images" },
  "session.web.status": { "zh-CN": "状态", "en-US": "Status" },
  "session.web.truncated": { "zh-CN": "已截断", "en-US": "Truncated" },
  "session.web.characterCount": {
    "zh-CN": "{count} 字符",
    "en-US": "{count} characters",
  },
  "session.web.characterCountOne": {
    "zh-CN": "{count} 字符",
    "en-US": "{count} character",
  },
  "session.web.imageCount": {
    "zh-CN": "{count} 张",
    "en-US": "{count} images",
  },
  "session.web.imageCountOne": {
    "zh-CN": "{count} 张",
    "en-US": "{count} image",
  },
  "session.web.readWeb": { "zh-CN": "读取网页", "en-US": "Fetch web content" },
  "session.web.noAddress": {
    "zh-CN": "未提供地址",
    "en-US": "No address provided",
  },
  "session.web.addressCount": {
    "zh-CN": "{count} 个地址",
    "en-US": "{count} addresses",
  },
  "session.web.addressCountOne": {
    "zh-CN": "{count} 个地址",
    "en-US": "{count} address",
  },
  "session.web.queryIndex": {
    "zh-CN": "查询 #{index}",
    "en-US": "Query #{index}",
  },
  "session.web.addressIndex": {
    "zh-CN": "地址 #{index}",
    "en-US": "Address #{index}",
  },
  "session.web.results": { "zh-CN": "结果", "en-US": "Results" },
  "session.web.resultCount": {
    "zh-CN": "{count} 个",
    "en-US": "{count} results",
  },
  "session.web.resultCountOne": {
    "zh-CN": "{count} 个",
    "en-US": "{count} result",
  },
  "session.web.searchContent": {
    "zh-CN": "搜索内容",
    "en-US": "Search content",
  },
  "session.web.noContentId": {
    "zh-CN": "未提供内容 ID",
    "en-US": "No content ID provided",
  },
  "session.hashline.request": { "zh-CN": "请求", "en-US": "Requests" },
  "session.hashline.requestCount": {
    "zh-CN": "{count} 处",
    "en-US": "{count} requests",
  },
  "session.hashline.requestCountOne": {
    "zh-CN": "{count} 处",
    "en-US": "{count} request",
  },
  "session.hashline.apply": { "zh-CN": "应用", "en-US": "Applied" },
  "session.hashline.applyCount": {
    "zh-CN": "{count} 处",
    "en-US": "{count} edits",
  },
  "session.hashline.applyCountOne": {
    "zh-CN": "{count} 处",
    "en-US": "{count} edit",
  },
  "session.hashline.result": { "zh-CN": "结果", "en-US": "Result" },
  "session.hashline.applied": { "zh-CN": "已应用", "en-US": "Applied" },
  "session.hashline.noChange": { "zh-CN": "无变更", "en-US": "No changes" },
  "session.hashline.restore": { "zh-CN": "恢复", "en-US": "Restored" },
  "session.hashline.remove": { "zh-CN": "移除", "en-US": "Removed" },
  "session.hashline.lineCount": {
    "zh-CN": "{count} 行",
    "en-US": "{count} lines",
  },
  "session.hashline.lineCountOne": {
    "zh-CN": "{count} 行",
    "en-US": "{count} line",
  },
  "session.hashline.undoSummary": {
    "zh-CN": "恢复 {restored} 行，移除 {removed} 行",
    "en-US": "Restored {restored} lines and removed {removed} lines",
  },
  "session.hashline.lines": { "zh-CN": "行数", "en-US": "Lines" },
  "session.hashline.range": { "zh-CN": "范围", "en-US": "Range" },
  "session.hashline.line": {
    "zh-CN": "第 {line} 行",
    "en-US": "Line {line}",
  },
  "session.hashline.lineRange": {
    "zh-CN": "第 {first}–{last} 行",
    "en-US": "Lines {first}–{last}",
  },
  "session.hashline.warning": { "zh-CN": "警告", "en-US": "Warnings" },
  "session.hashline.warningCount": {
    "zh-CN": "{count} 条",
    "en-US": "{count} warnings",
  },
  "session.hashline.warningCountOne": {
    "zh-CN": "{count} 条",
    "en-US": "{count} warning",
  },
  "session.hashline.snapshot": { "zh-CN": "快照", "en-US": "Snapshot" },
  "session.hashline.replace": {
    "zh-CN": "Hashline 替换",
    "en-US": "Hashline replace",
  },
  "session.hashline.undo": {
    "zh-CN": "撤销 Hashline 替换",
    "en-US": "Undo Hashline replace",
  },
  "session.hashline.noPath": {
    "zh-CN": "未提供文件路径",
    "en-US": "No file path provided",
  },
  "session.hashline.plannedChanges": {
    "zh-CN": "计划变更",
    "en-US": "Planned changes",
  },
  "session.hashline.change": {
    "zh-CN": "变更 {index}",
    "en-US": "Change {index}",
  },
  "session.hashline.writeLines": {
    "zh-CN": "写入 {count} 行",
    "en-US": "Write {count} lines",
  },
  "session.hashline.writeLine": {
    "zh-CN": "写入 {count} 行",
    "en-US": "Write {count} line",
  },
  "session.hashline.diff": { "zh-CN": "变更 Diff", "en-US": "Change diff" },
  "session.hashline.undoInfo": {
    "zh-CN": "撤销信息",
    "en-US": "Undo information",
  },
  "session.operations.tree": {
    "zh-CN": "会话树",
    "en-US": "Conversation tree",
  },
  "session.operations.menu": {
    "zh-CN": "会话操作",
    "en-US": "Conversation actions",
  },
  "session.operations.new": { "zh-CN": "新对话", "en-US": "New conversation" },
  "session.operations.rename": { "zh-CN": "重命名", "en-US": "Rename" },
  "session.operations.clone": {
    "zh-CN": "克隆当前分支",
    "en-US": "Clone current branch",
  },
  "session.operations.duplicateRuntime": {
    "zh-CN": "复制到运行环境",
    "en-US": "Copy to runtime",
  },
  "session.operations.fork": { "zh-CN": "派生", "en-US": "Fork" },
  "session.operations.exportJsonl": {
    "zh-CN": "导出 JSONL",
    "en-US": "Export JSONL",
  },
  "session.operations.exportHtml": {
    "zh-CN": "导出 HTML",
    "en-US": "Export HTML",
  },
  "session.operations.importJsonl": {
    "zh-CN": "导入 JSONL",
    "en-US": "Import JSONL",
  },
  "session.operations.stats": { "zh-CN": "统计", "en-US": "Statistics" },
  "session.operations.archive": { "zh-CN": "归档", "en-US": "Archive" },
  "session.operations.exportFailed": {
    "zh-CN": "导出 session 失败。",
    "en-US": "Failed to export the conversation.",
  },
  "session.operations.invalidResponse": {
    "zh-CN": "服务器返回了无效的会话操作结果。",
    "en-US": "The server returned an invalid conversation operation result.",
  },
  "session.operations.renameTitle": {
    "zh-CN": "重命名 session",
    "en-US": "Rename conversation",
  },
  "session.operations.renameDescription": {
    "zh-CN": "名称会由 Pi 写入当前 JSONL。",
    "en-US": "Pi writes the name to the current JSONL.",
  },
  "session.operations.name": {
    "zh-CN": "会话名称",
    "en-US": "Conversation name",
  },
  "session.operations.save": { "zh-CN": "保存", "en-US": "Save" },
  "session.operations.forkTitle": {
    "zh-CN": "派生会话",
    "en-US": "Fork conversation",
  },
  "session.operations.forkDescription": {
    "zh-CN": "从一条真实的用户消息创建新的 Pi session。",
    "en-US": "Create a new Pi session from an actual user message.",
  },
  "session.operations.entry": {
    "zh-CN": "会话条目",
    "en-US": "Conversation entry",
  },
  "session.operations.current": { "zh-CN": "当前", "en-US": "Current" },
  "session.operations.createFork": {
    "zh-CN": "创建 fork",
    "en-US": "Create fork",
  },
  "session.operations.statsTitle": {
    "zh-CN": "会话统计",
    "en-US": "Conversation statistics",
  },
  "session.operations.statsDescription": {
    "zh-CN": "统计由当前 Pi AgentSession 计算。",
    "en-US": "Statistics are calculated by the current Pi AgentSession.",
  },
  "session.operations.userMessages": {
    "zh-CN": "用户消息",
    "en-US": "User messages",
  },
  "session.operations.assistantMessages": {
    "zh-CN": "助手消息",
    "en-US": "Assistant messages",
  },
  "session.operations.toolCalls": {
    "zh-CN": "工具调用",
    "en-US": "Tool calls",
  },
  "session.operations.tokens": { "zh-CN": "令牌", "en-US": "Tokens" },
  "session.operations.cost": { "zh-CN": "成本", "en-US": "Cost" },
  "session.operations.context": { "zh-CN": "上下文", "en-US": "Context" },
  "session.operations.runtimeTitle": {
    "zh-CN": "复制到所选运行环境",
    "en-US": "Copy to selected runtime",
  },
  "session.operations.runtimeDescription": {
    "zh-CN": "复制当前分支并绑定到目标 runtime；原 session 与绑定保持不变。",
    "en-US":
      "Copy the current branch and bind it to the target runtime; the original session and binding stay unchanged.",
  },
  "session.operations.targetRuntime": {
    "zh-CN": "目标 runtime",
    "en-US": "Target runtime",
  },
  "session.operations.createCopy": {
    "zh-CN": "创建副本",
    "en-US": "Create copy",
  },
  "session.operations.importTitle": {
    "zh-CN": "导入 Pi JSONL",
    "en-US": "Import Pi JSONL",
  },
  "session.operations.importDescription": {
    "zh-CN": "Pi 会校验并创建一个新的 session；当前 session 保持不变。",
    "en-US":
      "Pi validates the file and creates a new session; the current session stays unchanged.",
  },
  "session.operations.importFile": {
    "zh-CN": "Pi JSONL 文件",
    "en-US": "Pi JSONL file",
  },
  "session.operations.import": { "zh-CN": "导入", "en-US": "Import" },
  "session.subagents.status.queued": {
    "zh-CN": "排队中",
    "en-US": "Queued",
  },
  "session.subagents.status.running": {
    "zh-CN": "运行中",
    "en-US": "Running",
  },
  "session.subagents.status.completed": {
    "zh-CN": "已完成",
    "en-US": "Completed",
  },
  "session.subagents.status.steered": {
    "zh-CN": "已收尾",
    "en-US": "Wrapped up",
  },
  "session.subagents.status.aborted": {
    "zh-CN": "达到轮次上限",
    "en-US": "Reached turn limit",
  },
  "session.subagents.status.stopped": {
    "zh-CN": "已停止",
    "en-US": "Stopped",
  },
  "session.subagents.status.error": {
    "zh-CN": "错误",
    "en-US": "Error",
  },
  "session.subagents.requestFailed": {
    "zh-CN": "子智能体请求失败（{status}）。",
    "en-US": "Subagent request failed ({status}).",
  },
  "session.subagents.durationMilliseconds": {
    "zh-CN": "{count} 毫秒",
    "en-US": "{count} ms",
  },
  "session.subagents.durationSeconds": {
    "zh-CN": "{count} 秒",
    "en-US": "{count} seconds",
  },
  "session.subagents.durationSecondsOne": {
    "zh-CN": "{count} 秒",
    "en-US": "{count} second",
  },
  "session.subagents.durationMinutes": {
    "zh-CN": "{count} 分钟",
    "en-US": "{count} minutes",
  },
  "session.subagents.durationMinutesOne": {
    "zh-CN": "{count} 分钟",
    "en-US": "{count} minute",
  },
  "session.subagents.toolUses": {
    "zh-CN": "{count} 次工具调用",
    "en-US": "{count} tool uses",
  },
  "session.subagents.toolUsesOne": {
    "zh-CN": "{count} 次工具调用",
    "en-US": "{count} tool use",
  },
  "session.subagents.tokens": {
    "zh-CN": "{count} 个令牌",
    "en-US": "{count} tokens",
  },
  "session.subagents.tokensOne": {
    "zh-CN": "{count} 个令牌",
    "en-US": "{count} token",
  },
  "session.subagents.compactions": {
    "zh-CN": "{count} 次压缩",
    "en-US": "{count} compactions",
  },
  "session.subagents.compactionsOne": {
    "zh-CN": "{count} 次压缩",
    "en-US": "{count} compaction",
  },
  "session.subagents.noDescription": {
    "zh-CN": "未提供任务描述",
    "en-US": "No task description",
  },
  "session.subagents.stopAria": {
    "zh-CN": "停止子智能体：{description}",
    "en-US": "Stop subagent: {description}",
  },
  "session.subagents.stop": { "zh-CN": "停止", "en-US": "Stop" },
  "session.subagents.connecting": {
    "zh-CN": "正在连接子智能体",
    "en-US": "Connecting to subagents",
  },
  "session.subagents.connectingDescription": {
    "zh-CN":
      "Pi Runtime 启动后，这里会显示 @tintinweb/pi-subagents 的实时状态。",
    "en-US":
      "Live @tintinweb/pi-subagents status appears here after Pi Runtime starts.",
  },
  "session.subagents.empty": {
    "zh-CN": "暂无子智能体",
    "en-US": "No subagents",
  },
  "session.subagents.emptyDescription": {
    "zh-CN": "通过 Pi 创建子智能体后，状态会实时出现在这里。",
    "en-US": "Subagents created through Pi appear here in real time.",
  },
  "session.subagents.activity": {
    "zh-CN": "子智能体活动",
    "en-US": "Subagent activity",
  },
  "session.subagents.activeCount": {
    "zh-CN": "{count} 个运行中",
    "en-US": "{count} running",
  },
  "session.subagents.activeCountOne": {
    "zh-CN": "{count} 个运行中",
    "en-US": "{count} running",
  },
  "session.subagents.endedCount": {
    "zh-CN": "{count} 个已结束",
    "en-US": "{count} ended",
  },
  "session.subagents.endedCountOne": {
    "zh-CN": "{count} 个已结束",
    "en-US": "{count} ended",
  },
  "session.subagents.live": { "zh-CN": "实时", "en-US": "Live" },
  "session.subagents.title": {
    "zh-CN": "子智能体",
    "en-US": "Subagents",
  },
  "session.subagents.waitingForRuntime": {
    "zh-CN": "等待 Pi Runtime",
    "en-US": "Waiting for Pi Runtime",
  },
  "session.subagents.noActivity": {
    "zh-CN": "暂无活动",
    "en-US": "No activity",
  },
  "session.subagents.completedCount": {
    "zh-CN": "{count} 个完成",
    "en-US": "{count} completed",
  },
  "session.subagents.completedCountOne": {
    "zh-CN": "{count} 个完成",
    "en-US": "{count} completed",
  },
  "session.subagents.issueCount": {
    "zh-CN": "{count} 个异常",
    "en-US": "{count} issues",
  },
  "session.subagents.issueCountOne": {
    "zh-CN": "{count} 个异常",
    "en-US": "{count} issue",
  },
  "session.diagnostics.button": {
    "zh-CN": "Runtime 诊断",
    "en-US": "Runtime diagnostics",
  },
  "session.diagnostics.title": {
    "zh-CN": "Runtime 诊断与协议检查器",
    "en-US": "Runtime diagnostics and protocol inspector",
  },
  "session.diagnostics.description": {
    "zh-CN":
      "直接读取 Host 管理的 Worker 状态和最近 100 条 Domain Protocol 事件。",
    "en-US":
      "Inspect the Host-managed Worker state and the 100 most recent Domain Protocol events.",
  },
  "session.diagnostics.loadFailed": {
    "zh-CN": "加载 runtime 诊断失败。",
    "en-US": "Failed to load runtime diagnostics.",
  },
  "session.diagnostics.connectionLost": {
    "zh-CN": "协议事件连接已断开，正在自动重连。",
    "en-US":
      "The protocol event connection was interrupted and is reconnecting automatically.",
  },
  "session.diagnostics.invalidEvent": {
    "zh-CN": "收到无效的协议事件；后续事件仍会继续监听。",
    "en-US":
      "An invalid protocol event was received. Listening for later events continues.",
  },
  "session.diagnostics.runtime": { "zh-CN": "Runtime", "en-US": "Runtime" },
  "session.diagnostics.profile": { "zh-CN": "Profile", "en-US": "Profile" },
  "session.diagnostics.pendingIpc": {
    "zh-CN": "待处理 IPC",
    "en-US": "Pending IPC",
  },
  "session.diagnostics.activeMcp": {
    "zh-CN": "活动 MCP",
    "en-US": "Active MCP",
  },
  "session.diagnostics.activeTools": {
    "zh-CN": "活动工具",
    "en-US": "Active tools",
  },
  "session.diagnostics.lastCrash": {
    "zh-CN": "最近一次崩溃",
    "en-US": "Most recent crash",
  },
  "session.diagnostics.protocolEvents": {
    "zh-CN": "协议事件",
    "en-US": "Protocol events",
  },
  "session.diagnostics.noEvents": {
    "zh-CN": "当前 Host 生命周期中还没有这个 session 的事件。",
    "en-US": "This conversation has no events in the current Host lifecycle.",
  },
  "session.inspector.title": {
    "zh-CN": "环境信息",
    "en-US": "Environment information",
  },
  "session.inspector.description": {
    "zh-CN": "查看当前项目的运行环境、子智能体与工作区状态。",
    "en-US":
      "View the current project's runtime, subagents, and workspace status.",
  },
  "session.inspector.unnamedProject": {
    "zh-CN": "未命名项目",
    "en-US": "Untitled project",
  },
  "session.inspector.localWorkspace": {
    "zh-CN": "本地工作区",
    "en-US": "Local workspace",
  },
  "session.inspector.readOnlyWorkspace": {
    "zh-CN": "只读历史 · 目录不可用",
    "en-US": "Read-only history · directory unavailable",
  },
  "session.inspector.recentlyUpdated": {
    "zh-CN": "最近更新",
    "en-US": "Recently updated",
  },
  "session.inspector.gitStatus": {
    "zh-CN": "Git 状态",
    "en-US": "Git status",
  },
  "session.inspector.changedCount": {
    "zh-CN": "{count} 个变更",
    "en-US": "{count} changes",
  },
  "session.inspector.changedCountOne": {
    "zh-CN": "{count} 个变更",
    "en-US": "{count} change",
  },
  "session.inspector.workspaceUnavailable": {
    "zh-CN": "工作区目录不可用，无法读取 Files 或 Git。",
    "en-US":
      "The workspace directory is unavailable, so Files and Git cannot be read.",
  },
  "session.inspector.noUpstream": {
    "zh-CN": "没有 upstream",
    "en-US": "No upstream",
  },
  "session.inspector.noCommit": {
    "zh-CN": "没有 commit",
    "en-US": "No commit",
  },
  "session.inspector.changedFiles": {
    "zh-CN": "变更文件",
    "en-US": "Changed files",
  },
  "session.inspector.moreChanges": {
    "zh-CN": "另有 {count} 个变更",
    "en-US": "{count} more changes",
  },
  "session.inspector.moreChangesOne": {
    "zh-CN": "另有 {count} 个变更",
    "en-US": "{count} more change",
  },
  "session.inspector.clean": {
    "zh-CN": "工作区干净",
    "en-US": "Workspace clean",
  },
  "session.tree.filter.default": { "zh-CN": "默认", "en-US": "Default" },
  "session.tree.filter.user": {
    "zh-CN": "仅用户",
    "en-US": "User only",
  },
  "session.tree.filter.labeled": {
    "zh-CN": "已标记",
    "en-US": "Labeled",
  },
  "session.tree.filter.all": { "zh-CN": "全部", "en-US": "All" },
  "session.tree.userMessage": {
    "zh-CN": "用户消息",
    "en-US": "User message",
  },
  "session.tree.assistantReply": {
    "zh-CN": "助手回复",
    "en-US": "Assistant reply",
  },
  "session.tree.toolResult": {
    "zh-CN": "工具结果",
    "en-US": "Tool result",
  },
  "session.tree.compaction": {
    "zh-CN": "上下文压缩",
    "en-US": "Context compaction",
  },
  "session.tree.branchSummary": {
    "zh-CN": "分支摘要",
    "en-US": "Branch summary",
  },
  "session.tree.title": { "zh-CN": "会话树", "en-US": "Conversation tree" },
  "session.tree.summary": {
    "zh-CN": "{count} 个条目 · 当前分支 {active}",
    "en-US": "{count} entries · {active} on current branch",
  },
  "session.tree.summaryOne": {
    "zh-CN": "{count} 个条目 · 当前分支 {active}",
    "en-US": "{count} entry · {active} on current branch",
  },
  "session.tree.loadingBranches": {
    "zh-CN": "正在读取真实的 JSONL 分支…",
    "en-US": "Reading actual JSONL branches…",
  },
  "session.tree.searchPlaceholder": {
    "zh-CN": "搜索消息或标签",
    "en-US": "Search messages or labels",
  },
  "session.tree.searchAria": {
    "zh-CN": "搜索 session tree",
    "en-US": "Search the conversation tree",
  },
  "session.tree.filterAria": {
    "zh-CN": "会话树过滤器",
    "en-US": "Conversation tree filters",
  },
  "session.tree.loading": {
    "zh-CN": "正在读取会话树…",
    "en-US": "Reading conversation tree…",
  },
  "session.tree.entriesAria": {
    "zh-CN": "会话条目",
    "en-US": "Conversation entries",
  },
  "session.tree.expandBranch": {
    "zh-CN": "展开分支",
    "en-US": "Expand branch",
  },
  "session.tree.collapseBranch": {
    "zh-CN": "折叠分支",
    "en-US": "Collapse branch",
  },
  "session.tree.depth": {
    "zh-CN": "层级 {count}。",
    "en-US": "Depth {count}.",
  },
  "session.tree.current": { "zh-CN": "当前", "en-US": "Current" },
  "session.tree.noMatches": {
    "zh-CN": "没有符合当前条件的节点",
    "en-US": "No nodes match the current filters",
  },
  "session.tree.selected": {
    "zh-CN": "已选择 · {name} · {time}",
    "en-US": "Selected · {name} · {time}",
  },
  "session.tree.selectNode": {
    "zh-CN": "选择一个节点",
    "en-US": "Select a node",
  },
  "session.tree.summarize": {
    "zh-CN": "总结放弃的分支",
    "en-US": "Summarize abandoned branches",
  },
  "session.tree.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "session.tree.navigate": {
    "zh-CN": "切换到此节点",
    "en-US": "Switch to this node",
  },

  "project.header.unknownDirectory": {
    "zh-CN": "未知目录",
    "en-US": "Unknown directory",
  },
  "project.tools.ariaLabel": {
    "zh-CN": "项目工具",
    "en-US": "Project tools",
  },
  "project.tools.sessions": { "zh-CN": "会话", "en-US": "Conversations" },
  "project.tools.files": { "zh-CN": "文件", "en-US": "Files" },
  "project.tools.git": { "zh-CN": "Git", "en-US": "Git" },
  "project.sessions.ariaLabel": {
    "zh-CN": "项目会话",
    "en-US": "Project conversations",
  },
  "project.sessions.new": { "zh-CN": "新对话", "en-US": "New conversation" },
  "project.sessions.messageCount": {
    "zh-CN": "{count} 条消息",
    "en-US": "{count} messages",
  },
  "project.sessions.messageCountOne": {
    "zh-CN": "{count} 条消息",
    "en-US": "{count} message",
  },
  "project.sessions.emptyTitle": {
    "zh-CN": "还没有会话",
    "en-US": "No conversations yet",
  },
  "project.sessions.emptyDescription": {
    "zh-CN": "从上方新建会话，开始在这个项目中工作。",
    "en-US": "Start a new conversation above to work in this project.",
  },
  "project.files.pathAriaLabel": {
    "zh-CN": "文件路径",
    "en-US": "File path",
  },
  "project.files.root": { "zh-CN": "根目录", "en-US": "Root" },
  "project.files.readOnlyDescription": {
    "zh-CN": "只读浏览真实项目目录。",
    "en-US": "Browse the real project directory in read-only mode.",
  },
  "project.files.download": {
    "zh-CN": "下载原文件",
    "en-US": "Download original file",
  },
  "project.files.refresh": {
    "zh-CN": "刷新文件",
    "en-US": "Refresh files",
  },
  "project.files.emptyDirectory": {
    "zh-CN": "目录为空",
    "en-US": "This directory is empty",
  },
  "project.files.openFailed": {
    "zh-CN": "无法打开文件",
    "en-US": "Could not open file",
  },
  "project.files.openFailedWithMessage": {
    "zh-CN": "无法打开：{message}",
    "en-US": "Could not open: {message}",
  },
  "project.files.previewUnavailable": {
    "zh-CN": "无法预览",
    "en-US": "Preview unavailable",
  },
  "project.files.binaryDescription": {
    "zh-CN": "这是二进制文件，可下载原文件。",
    "en-US": "This is a binary file. Download the original file to view it.",
  },
  "project.files.tooLargeDescription": {
    "zh-CN": "文件超过 1 MiB，可下载原文件。",
    "en-US": "This file exceeds 1 MiB. Download the original file to view it.",
  },
  "project.files.type.directory": {
    "zh-CN": "目录",
    "en-US": "directory",
  },
  "project.files.type.symbolicLink": {
    "zh-CN": "符号链接",
    "en-US": "symbolic link",
  },
  "project.files.type.file": { "zh-CN": "文件", "en-US": "file" },
  "project.files.type.other": { "zh-CN": "其他", "en-US": "other" },
  "project.git.refresh": { "zh-CN": "刷新状态", "en-US": "Refresh status" },
  "project.git.refreshing": { "zh-CN": "刷新中…", "en-US": "Refreshing…" },
  "project.git.unavailable": {
    "zh-CN": "Git 不可用",
    "en-US": "Git unavailable",
  },
  "project.git.detachedHead": {
    "zh-CN": "Detached HEAD",
    "en-US": "Detached HEAD",
  },
  "project.git.divergence": {
    "zh-CN": "领先 {ahead} · 落后 {behind}",
    "en-US": "ahead {ahead} · behind {behind}",
  },
  "project.git.workspace": { "zh-CN": "工作区", "en-US": "Working tree" },
  "project.git.changedSummary": {
    "zh-CN": "{count} 个真实 Git 状态条目。",
    "en-US": "{count} Git status entries.",
  },
  "project.git.changedSummaryOne": {
    "zh-CN": "{count} 个真实 Git 状态条目。",
    "en-US": "{count} Git status entry.",
  },
  "project.git.cleanSummary": {
    "zh-CN": "工作区没有未提交变更。",
    "en-US": "The working tree has no uncommitted changes.",
  },
  "project.git.originalPath": {
    "zh-CN": "原路径：{path}",
    "en-US": "From {path}",
  },
  "project.git.clean": { "zh-CN": "干净", "en-US": "Clean" },
  "project.git.error.notInstalled": {
    "zh-CN": "未安装 Git 可执行文件。",
    "en-US": "The Git executable is not installed.",
  },
  "project.git.error.notWorktree": {
    "zh-CN": "项目不在 Git 工作树中。",
    "en-US": "The project is not inside a Git worktree.",
  },
  "project.git.error.directoryMissing": {
    "zh-CN": "项目目录已不存在。",
    "en-US": "The project directory no longer exists.",
  },
  "project.git.error.statusFailed": {
    "zh-CN": "读取 Git 状态失败。",
    "en-US": "Git status failed.",
  },
  "project.git.error.divergenceFailed": {
    "zh-CN": "读取 Git 分支差异失败。",
    "en-US": "Git divergence check failed.",
  },
  "project.git.error.statsFailed": {
    "zh-CN": "读取 Git 增删行统计失败。",
    "en-US": "Git line statistics failed.",
  },
  "project.git.error.pathNoChanges": {
    "zh-CN": "请求的路径没有工作区变更。",
    "en-US": "The requested path has no working tree changes.",
  },
  "project.git.error.diffFailed": {
    "zh-CN": "读取 Git 差异失败。",
    "en-US": "Git diff failed.",
  },
  "project.git.error.indexFailed": {
    "zh-CN": "初始化 Git 差异索引失败。",
    "en-US": "Git diff index initialization failed.",
  },
  "project.git.error.outsideProject": {
    "zh-CN": "Git 返回了注册项目之外的路径。",
    "en-US": "Git returned a path outside the registered project.",
  },
  "project.review.fileList": {
    "zh-CN": "变更文件",
    "en-US": "Changed files",
  },
  "project.review.changeCount": {
    "zh-CN": "{count} 个变更",
    "en-US": "{count} changes",
  },
  "project.review.changeCountOne": {
    "zh-CN": "{count} 个变更",
    "en-US": "{count} change",
  },
  "project.review.cleanTitle": {
    "zh-CN": "工作区没有变更",
    "en-US": "No working tree changes",
  },
  "project.review.cleanDescription": {
    "zh-CN": "审阅显示当前工作区相对 HEAD 的改动。",
    "en-US":
      "Review shows changes in the current working tree relative to HEAD.",
  },
  "project.review.diffReadFailed": {
    "zh-CN": "无法读取差异",
    "en-US": "Could not read diff",
  },
  "project.review.noTextDiffTitle": {
    "zh-CN": "没有文本差异",
    "en-US": "No text diff",
  },
  "project.review.noTextDiffDescription": {
    "zh-CN": "该条目可能只包含文件模式或二进制变更。",
    "en-US": "This entry may only contain a file mode or binary change.",
  },
  "project.review.diffAriaLabel": {
    "zh-CN": "{path} 的统一差异",
    "en-US": "Unified diff for {path}",
  },
  "project.review.oldLine": { "zh-CN": "旧行", "en-US": "Old line" },
  "project.review.newLine": { "zh-CN": "新行", "en-US": "New line" },
  "project.review.content": { "zh-CN": "内容", "en-US": "Content" },
  "project.review.showMore": {
    "zh-CN": "再显示 {count} 行（剩余 {remaining} 行）",
    "en-US": "Show {count} more ({remaining} remaining)",
  },

  "workspace.nav.ariaLabel": {
    "zh-CN": "主导航",
    "en-US": "Main navigation",
  },
  "workspace.nav.search": {
    "zh-CN": "搜索对话",
    "en-US": "Search conversations",
  },
  "workspace.nav.newConversation": {
    "zh-CN": "新对话",
    "en-US": "New conversation",
  },
  "workspace.nav.pinned": { "zh-CN": "置顶", "en-US": "Pinned" },
  "workspace.nav.projects": { "zh-CN": "项目", "en-US": "Projects" },
  "workspace.nav.choosingProject": {
    "zh-CN": "正在选择项目",
    "en-US": "Choosing a project",
  },
  "workspace.nav.addProject": {
    "zh-CN": "添加项目",
    "en-US": "Add project",
  },
  "workspace.nav.collapseProjects": {
    "zh-CN": "收起",
    "en-US": "Show fewer",
  },
  "workspace.nav.expandProjects": {
    "zh-CN": "展开显示",
    "en-US": "Show more",
  },
  "workspace.nav.tasks": { "zh-CN": "任务", "en-US": "Tasks" },
  "workspace.nav.settings": { "zh-CN": "设置", "en-US": "Settings" },
  "workspace.nav.pinConversation": {
    "zh-CN": "置顶对话",
    "en-US": "Pin conversation",
  },
  "workspace.nav.unpinConversation": {
    "zh-CN": "取消置顶对话",
    "en-US": "Unpin conversation",
  },
  "workspace.nav.unpin": { "zh-CN": "取消置顶", "en-US": "Unpin" },
  "workspace.nav.archiveConversation": {
    "zh-CN": "归档对话",
    "en-US": "Archive conversation",
  },
  "workspace.nav.running": {
    "zh-CN": "正在运行",
    "en-US": "Running",
  },
  "workspace.nav.newlyCompleted": {
    "zh-CN": "新完成",
    "en-US": "Newly completed",
  },
  "workspace.nav.newTask": { "zh-CN": "新任务", "en-US": "New task" },
  "workspace.nav.unnamedConversation": {
    "zh-CN": "未命名会话",
    "en-US": "Untitled conversation",
  },

  "workspace.project.pin": {
    "zh-CN": "置顶项目",
    "en-US": "Pin project",
  },
  "workspace.project.unpin": {
    "zh-CN": "取消置顶项目",
    "en-US": "Unpin project",
  },
  "workspace.project.reveal": {
    "zh-CN": "在文件管理器中显示",
    "en-US": "Show in file manager",
  },
  "workspace.project.createWorktree": {
    "zh-CN": "创建永久工作树",
    "en-US": "Create permanent worktree",
  },
  "workspace.project.rename": {
    "zh-CN": "重命名项目",
    "en-US": "Rename project",
  },
  "workspace.project.archiveConversations": {
    "zh-CN": "归档对话",
    "en-US": "Archive conversations",
  },
  "workspace.project.remove": { "zh-CN": "移除", "en-US": "Remove" },
  "workspace.project.conversationCount": {
    "zh-CN": "{count} 个对话",
    "en-US": "Conversations: {count}",
  },
  "workspace.project.toggleConversations": {
    "zh-CN": "展开或折叠 {name} 对话列表",
    "en-US": "Expand or collapse conversations in {name}",
  },
  "workspace.project.moreActions": {
    "zh-CN": "{name} 更多操作",
    "en-US": "More actions for {name}",
  },
  "workspace.project.newConversation": {
    "zh-CN": "在 {name} 中新建对话",
    "en-US": "New conversation in {name}",
  },
  "workspace.project.viewAll": {
    "zh-CN": "查看全部 {count} 条",
    "en-US": "View all {count}",
  },
  "workspace.project.renameDescription": {
    "zh-CN": "只修改侧栏显示名称，不会重命名磁盘目录。",
    "en-US": "This only changes the sidebar label, not the folder on disk.",
  },
  "workspace.project.name": {
    "zh-CN": "项目名称",
    "en-US": "Project name",
  },
  "workspace.project.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "workspace.project.save": { "zh-CN": "保存", "en-US": "Save" },
  "workspace.project.worktreeDescription": {
    "zh-CN": "Git 会创建新分支和工作树，完成后自动添加为项目。",
    "en-US":
      "Git creates a new branch and worktree, then adds it as a project.",
  },
  "workspace.project.worktreePath": {
    "zh-CN": "工作树路径",
    "en-US": "Worktree path",
  },
  "workspace.project.newBranch": {
    "zh-CN": "新分支",
    "en-US": "New branch",
  },
  "workspace.project.create": { "zh-CN": "创建", "en-US": "Create" },
  "workspace.project.archiveTitle": {
    "zh-CN": "归档 {name} 中的对话？",
    "en-US": "Archive conversations in {name}?",
  },
  "workspace.project.archiveDescriptionOne": {
    "zh-CN":
      "将从导航中移除 {count} 个对话；如果它正在运行，会先停止。项目目录和 Pi session 文件不会删除。",
    "en-US":
      "This removes {count} conversation from navigation and stops it if it is running. The project folder and Pi session files are kept.",
  },
  "workspace.project.archiveDescriptionMany": {
    "zh-CN":
      "将从导航中移除 {count} 个对话；正在运行的对话会先停止。项目目录和 Pi session 文件不会删除。",
    "en-US":
      "This removes {count} conversations from navigation and stops any that are running. The project folder and Pi session files are kept.",
  },
  "workspace.project.archiveConfirmOne": {
    "zh-CN": "归档 {count} 个对话",
    "en-US": "Archive {count} conversation",
  },
  "workspace.project.archiveConfirmMany": {
    "zh-CN": "归档 {count} 个对话",
    "en-US": "Archive {count} conversations",
  },
  "workspace.project.removeTitle": {
    "zh-CN": "移除 {name}？",
    "en-US": "Remove {name}?",
  },
  "workspace.project.removeDescription": {
    "zh-CN":
      "只会从项目列表中移除。已有对话、磁盘目录和 Pi session 文件都不会改变。",
    "en-US":
      "This only removes the project from the list. Existing conversations, the folder on disk, and Pi session files are unchanged.",
  },

  "home.projectSwitchFailed": {
    "zh-CN": "工作项目切换未完成，请重试。",
    "en-US": "The project switch did not complete. Try again.",
  },
  "home.imageOnlyPrompt": {
    "zh-CN": "请查看附加图片。",
    "en-US": "Please review the attached image.",
  },
  "home.heading.projectBefore": {
    "zh-CN": "我们应该在 ",
    "en-US": "What should we build in ",
  },
  "home.heading.projectAfter": { "zh-CN": " 中构建什么？", "en-US": "?" },
  "home.heading.default": {
    "zh-CN": "你想让 Pi 做什么？",
    "en-US": "What would you like Pi to do?",
  },
  "home.starter.explore": {
    "zh-CN": "探索并理解代码",
    "en-US": "Explore and understand code",
  },
  "home.starter.build": {
    "zh-CN": "构建新功能、应用或工具",
    "en-US": "Build a feature, app, or tool",
  },
  "home.starter.review": {
    "zh-CN": "审查代码并提出修改建议",
    "en-US": "Review code and suggest changes",
  },
  "home.starter.fix": {
    "zh-CN": "修复问题和失败",
    "en-US": "Fix a bug or failure",
  },
  "home.modelUnavailable": {
    "zh-CN": "当前模型不可用。请先配置 Provider 凭据或选择可用模型。",
    "en-US":
      "The current model is unavailable. Configure provider credentials or choose an available model.",
  },
  "home.openSettings": { "zh-CN": "去设置", "en-US": "Open settings" },
  "home.composer.placeholder": {
    "zh-CN": "描述你想构建或解决的问题",
    "en-US": "Describe what you want to build or solve",
  },
  "home.composer.ariaLabel": {
    "zh-CN": "第一条消息",
    "en-US": "First message",
  },
  "home.command.goal": { "zh-CN": "目标", "en-US": "Goal" },
  "home.command.compact": { "zh-CN": "压缩", "en-US": "Compact" },
  "home.command.reload": { "zh-CN": "重新加载", "en-US": "Reload" },
  "home.command.insideTask": {
    "zh-CN": "进入任务后可用",
    "en-US": "Available after entering a task",
  },
  "home.status.creatingTask": {
    "zh-CN": "正在创建任务…",
    "en-US": "Creating task…",
  },
  "home.status.loadingModels": {
    "zh-CN": "正在加载模型",
    "en-US": "Loading models",
  },
  "home.status.readingImages": {
    "zh-CN": "正在读取图片…",
    "en-US": "Reading images…",
  },
  "home.project.ariaLabel": {
    "zh-CN": "工作项目",
    "en-US": "Project",
  },
  "home.project.standalone": {
    "zh-CN": "独立任务",
    "en-US": "Standalone task",
  },
  "home.project.choosing": {
    "zh-CN": "正在选择…",
    "en-US": "Choosing…",
  },
  "home.project.add": { "zh-CN": "添加项目", "en-US": "Add project" },

  "search.title": { "zh-CN": "搜索", "en-US": "Search" },
  "search.description": {
    "zh-CN": "搜索对话标题、消息与工具记录",
    "en-US": "Search conversation titles, messages, and tool records",
  },
  "search.summary": {
    "zh-CN": "“{query}” 找到 {count} 个匹配结果",
    "en-US": "Matches for “{query}”: {count}",
  },
  "search.label": { "zh-CN": "搜索对话", "en-US": "Search conversations" },
  "search.placeholder": {
    "zh-CN": "输入关键词",
    "en-US": "Enter keywords",
  },
  "search.submit": { "zh-CN": "搜索", "en-US": "Search" },
  "search.submitting": { "zh-CN": "搜索中…", "en-US": "Searching…" },
  "search.results.ariaLabel": {
    "zh-CN": "搜索结果",
    "en-US": "Search results",
  },
  "search.standaloneTask": {
    "zh-CN": "独立任务",
    "en-US": "Standalone task",
  },
  "search.empty.initialTitle": {
    "zh-CN": "查找过去的对话",
    "en-US": "Find past conversations",
  },
  "search.empty.initialDescription": {
    "zh-CN": "输入关键词后，会搜索已索引的标题、消息和工具记录。",
    "en-US":
      "Enter keywords to search indexed titles, messages, and tool records.",
  },
  "search.empty.noResultsTitle": {
    "zh-CN": "没有匹配结果",
    "en-US": "No matching results",
  },
  "search.empty.noResultsDescription": {
    "zh-CN": "尝试更短的关键词，或检查对话是否已归档。",
    "en-US":
      "Try a shorter keyword or check whether the conversation was archived.",
  },
  "search.entry.title": { "zh-CN": "标题", "en-US": "Title" },
  "search.entry.message": { "zh-CN": "消息", "en-US": "Message" },
  "search.entry.tool": { "zh-CN": "工具", "en-US": "Tool" },
  "search.entry.modelChange": {
    "zh-CN": "模型变更",
    "en-US": "Model change",
  },
  "search.entry.thinkingChange": {
    "zh-CN": "推理强度变更",
    "en-US": "Reasoning change",
  },
  "search.entry.compaction": {
    "zh-CN": "上下文压缩",
    "en-US": "Context compaction",
  },
  "search.entry.branchSummary": {
    "zh-CN": "分支摘要",
    "en-US": "Branch summary",
  },
  "search.entry.customMessage": {
    "zh-CN": "扩展消息",
    "en-US": "Extension message",
  },
  "search.entry.goal": { "zh-CN": "目标", "en-US": "Goal" },
  "search.entry.record": { "zh-CN": "记录", "en-US": "Record" },

  "settings.nav.general": { "zh-CN": "常规", "en-US": "General" },
  "settings.nav.appearance": { "zh-CN": "外观", "en-US": "Appearance" },
  "settings.nav.shortcuts": { "zh-CN": "键盘快捷键", "en-US": "Keyboard" },
  "settings.nav.archive": { "zh-CN": "归档", "en-US": "Archive" },
  "settings.nav.models": { "zh-CN": "模型", "en-US": "Models" },
  "settings.nav.packages": { "zh-CN": "软件包", "en-US": "Packages" },
  "settings.nav.extensions": { "zh-CN": "扩展", "en-US": "Extensions" },
  "settings.nav.piExtensions": {
    "zh-CN": "Pi 扩展",
    "en-US": "Pi Extensions",
  },
  "settings.nav.webuiExtensions": {
    "zh-CN": "WebUI 扩展",
    "en-US": "WebUI Extensions",
  },
  "settings.nav.skills": { "zh-CN": "技能", "en-US": "Skills" },
  "settings.nav.mcp": { "zh-CN": "MCP", "en-US": "MCP" },
  "settings.nav.developer": { "zh-CN": "开发者", "en-US": "Developer" },
  "settings.nav.ariaLabel": {
    "zh-CN": "设置导航",
    "en-US": "Settings navigation",
  },
  "settings.label": { "zh-CN": "设置", "en-US": "Settings" },
  "settings.back": { "zh-CN": "返回上个界面", "en-US": "Go back" },

  "settings.page.general.title": { "zh-CN": "常规", "en-US": "General" },
  "settings.page.general.description": {
    "zh-CN": "配置本地 Web Host 的启动行为。",
    "en-US": "Configure how the local Web Host starts.",
  },
  "settings.page.appearance.title": { "zh-CN": "外观", "en-US": "Appearance" },
  "settings.page.appearance.description": {
    "zh-CN": "调整真实应用壳的主题、语言与尺寸。",
    "en-US": "Adjust the app shell theme, language, and dimensions.",
  },
  "settings.page.shortcuts.title": {
    "zh-CN": "键盘快捷键",
    "en-US": "Keyboard shortcuts",
  },
  "settings.page.shortcuts.description": {
    "zh-CN": "查看并自定义 pi-web-codex 已支持功能的快捷键。",
    "en-US":
      "View and customize shortcuts for features supported by pi-web-codex.",
  },

  "shortcuts.category.conversation": {
    "zh-CN": "对话",
    "en-US": "Conversation",
  },
  "shortcuts.category.conversation.description": {
    "zh-CN": "创建、整理和复制当前对话信息。",
    "en-US": "Create, organize, and copy details from conversations.",
  },
  "shortcuts.category.navigation": {
    "zh-CN": "导航",
    "en-US": "Navigation",
  },
  "shortcuts.category.navigation.description": {
    "zh-CN": "浏览历史记录并切换侧边栏中的对话。",
    "en-US": "Move through history and conversations in the sidebar.",
  },
  "shortcuts.category.workspace": {
    "zh-CN": "工作区",
    "en-US": "Workspace",
  },
  "shortcuts.category.workspace.description": {
    "zh-CN": "控制侧边栏、审阅、文件和终端面板。",
    "en-US": "Control sidebar, review, file, and terminal panels.",
  },
  "shortcuts.category.composer": {
    "zh-CN": "编辑器",
    "en-US": "Composer",
  },
  "shortcuts.category.composer.description": {
    "zh-CN": "控制消息编辑器、模型和推理强度。",
    "en-US": "Control the message composer, model, and reasoning effort.",
  },
  "shortcuts.category.settings": {
    "zh-CN": "设置",
    "en-US": "Settings",
  },
  "shortcuts.category.settings.description": {
    "zh-CN": "直接打开 pi-web-codex 设置页面。",
    "en-US": "Open pi-web-codex settings pages directly.",
  },
  "shortcuts.search.label": {
    "zh-CN": "搜索快捷键",
    "en-US": "Search shortcuts",
  },
  "shortcuts.search.placeholder": {
    "zh-CN": "搜索操作或说明",
    "en-US": "Search actions or descriptions",
  },
  "shortcuts.search.empty": {
    "zh-CN": "没有匹配的快捷键。",
    "en-US": "No shortcuts match your search.",
  },
  "shortcuts.browserNotice": {
    "zh-CN":
      "快捷键保存在当前浏览器中并立即生效；浏览器或系统保留的组合键可能无法被网页接收。",
    "en-US":
      "Shortcuts are saved in this browser and apply immediately. Browser or system reserved combinations may not reach the page.",
  },
  "shortcuts.resetAll": {
    "zh-CN": "全部恢复默认",
    "en-US": "Reset all",
  },
  "shortcuts.reset": { "zh-CN": "恢复", "en-US": "Reset" },
  "shortcuts.resetCommand": {
    "zh-CN": "恢复“{command}”的默认快捷键",
    "en-US": "Reset shortcuts for {command}",
  },
  "shortcuts.add": { "zh-CN": "添加", "en-US": "Add" },
  "shortcuts.recording": {
    "zh-CN": "请按快捷键…",
    "en-US": "Press shortcut…",
  },
  "shortcuts.unassigned": { "zh-CN": "未分配", "en-US": "Unassigned" },
  "shortcuts.remove": {
    "zh-CN": "从“{command}”移除 {shortcut}",
    "en-US": "Remove {shortcut} from {command}",
  },
  "shortcuts.record.invalid": {
    "zh-CN": "请使用包含修饰键的组合键，或 F1–F12。",
    "en-US": "Use a modified key combination or F1–F12.",
  },
  "shortcuts.record.conflict": {
    "zh-CN": "该快捷键已分配给“{command}”。",
    "en-US": "That shortcut is already assigned to {command}.",
  },
  "shortcuts.copied.deepLink": {
    "zh-CN": "已复制深层链接。",
    "en-US": "Deep link copied.",
  },
  "shortcuts.copied.conversationPath": {
    "zh-CN": "已复制对话路径。",
    "en-US": "Conversation path copied.",
  },
  "shortcuts.copied.id": {
    "zh-CN": "已复制会话 ID。",
    "en-US": "Session ID copied.",
  },
  "shortcuts.copied.workingDirectory": {
    "zh-CN": "已复制工作目录。",
    "en-US": "Working directory copied.",
  },

  "shortcuts.command.new.label": {
    "zh-CN": "新聊天",
    "en-US": "New conversation",
  },
  "shortcuts.command.new.description": {
    "zh-CN": "在当前项目中开始聊天；没有项目上下文时创建独立聊天。",
    "en-US":
      "Start in the current project, or standalone without project context.",
  },
  "shortcuts.command.newIndependent.label": {
    "zh-CN": "新建独立聊天",
    "en-US": "New standalone conversation",
  },
  "shortcuts.command.newIndependent.description": {
    "zh-CN": "在项目外开始新聊天。",
    "en-US": "Start a conversation outside a project.",
  },
  "shortcuts.command.archive.label": {
    "zh-CN": "归档聊天",
    "en-US": "Archive conversation",
  },
  "shortcuts.command.archive.description": {
    "zh-CN": "归档当前聊天并返回首页。",
    "en-US": "Archive the current conversation and return home.",
  },
  "shortcuts.command.togglePin.label": {
    "zh-CN": "切换置顶状态",
    "en-US": "Toggle pin",
  },
  "shortcuts.command.togglePin.description": {
    "zh-CN": "置顶或取消置顶当前聊天。",
    "en-US": "Pin or unpin the current conversation.",
  },
  "shortcuts.command.rename.label": {
    "zh-CN": "重命名聊天",
    "en-US": "Rename conversation",
  },
  "shortcuts.command.rename.description": {
    "zh-CN": "打开当前聊天的重命名对话框。",
    "en-US": "Open the rename dialog for the current conversation.",
  },
  "shortcuts.command.continue.label": {
    "zh-CN": "在新聊天中继续",
    "en-US": "Continue in new conversation",
  },
  "shortcuts.command.continue.description": {
    "zh-CN": "克隆当前聊天并在副本中继续。",
    "en-US": "Clone the current conversation and continue in the copy.",
  },
  "shortcuts.command.copyPath.label": {
    "zh-CN": "复制对话路径",
    "en-US": "Copy conversation path",
  },
  "shortcuts.command.copyPath.description": {
    "zh-CN": "复制当前 Pi JSONL 文件路径。",
    "en-US": "Copy the current Pi JSONL file path.",
  },
  "shortcuts.command.copyDeepLink.label": {
    "zh-CN": "复制深层链接",
    "en-US": "Copy deep link",
  },
  "shortcuts.command.copyDeepLink.description": {
    "zh-CN": "复制当前页面的完整链接。",
    "en-US": "Copy the full link to the current page.",
  },
  "shortcuts.command.copyId.label": {
    "zh-CN": "复制会话 ID",
    "en-US": "Copy session ID",
  },
  "shortcuts.command.copyId.description": {
    "zh-CN": "复制当前 Pi 会话 ID。",
    "en-US": "Copy the current Pi session ID.",
  },
  "shortcuts.command.copyWorkingDirectory.label": {
    "zh-CN": "复制工作目录",
    "en-US": "Copy working directory",
  },
  "shortcuts.command.copyWorkingDirectory.description": {
    "zh-CN": "复制当前聊天的工作目录。",
    "en-US": "Copy the working directory for the current conversation.",
  },
  "shortcuts.command.back.label": { "zh-CN": "返回", "en-US": "Back" },
  "shortcuts.command.back.description": {
    "zh-CN": "在应用导航历史记录中返回。",
    "en-US": "Go back in application navigation history.",
  },
  "shortcuts.command.forward.label": { "zh-CN": "前进", "en-US": "Forward" },
  "shortcuts.command.forward.description": {
    "zh-CN": "在应用导航历史记录中前进。",
    "en-US": "Go forward in application navigation history.",
  },
  "shortcuts.command.nextConversation.label": {
    "zh-CN": "下一个聊天",
    "en-US": "Next conversation",
  },
  "shortcuts.command.nextConversation.description": {
    "zh-CN": "循环打开侧边栏中的下一个可见聊天。",
    "en-US": "Cycle to the next visible conversation in the sidebar.",
  },
  "shortcuts.command.previousConversation.label": {
    "zh-CN": "上一个聊天",
    "en-US": "Previous conversation",
  },
  "shortcuts.command.previousConversation.description": {
    "zh-CN": "循环打开侧边栏中的上一个可见聊天。",
    "en-US": "Cycle to the previous visible conversation in the sidebar.",
  },
  "shortcuts.command.switchConversation.label": {
    "zh-CN": "切换聊天…",
    "en-US": "Switch conversation…",
  },
  "shortcuts.command.switchConversation.description": {
    "zh-CN": "打开聊天搜索。",
    "en-US": "Open conversation search.",
  },
  "shortcuts.command.conversation1.label": {
    "zh-CN": "转到聊天 1",
    "en-US": "Go to conversation 1",
  },
  "shortcuts.command.conversation2.label": {
    "zh-CN": "转到聊天 2",
    "en-US": "Go to conversation 2",
  },
  "shortcuts.command.conversation3.label": {
    "zh-CN": "转到聊天 3",
    "en-US": "Go to conversation 3",
  },
  "shortcuts.command.conversation4.label": {
    "zh-CN": "转到聊天 4",
    "en-US": "Go to conversation 4",
  },
  "shortcuts.command.conversation5.label": {
    "zh-CN": "转到聊天 5",
    "en-US": "Go to conversation 5",
  },
  "shortcuts.command.conversation6.label": {
    "zh-CN": "转到聊天 6",
    "en-US": "Go to conversation 6",
  },
  "shortcuts.command.conversation7.label": {
    "zh-CN": "转到聊天 7",
    "en-US": "Go to conversation 7",
  },
  "shortcuts.command.conversation8.label": {
    "zh-CN": "转到聊天 8",
    "en-US": "Go to conversation 8",
  },
  "shortcuts.command.conversation9.label": {
    "zh-CN": "转到聊天 9",
    "en-US": "Go to conversation 9",
  },
  "shortcuts.command.conversationNumber.description": {
    "zh-CN": "打开侧边栏当前可见位置中的聊天。",
    "en-US": "Open the conversation at this visible sidebar position.",
  },
  "shortcuts.command.toggleSidebar.label": {
    "zh-CN": "切换边栏",
    "en-US": "Toggle sidebar",
  },
  "shortcuts.command.toggleSidebar.description": {
    "zh-CN": "显示或隐藏主侧边栏。",
    "en-US": "Show or hide the main sidebar.",
  },
  "shortcuts.command.openReview.label": {
    "zh-CN": "打开审查选项卡",
    "en-US": "Open review tab",
  },
  "shortcuts.command.openReview.description": {
    "zh-CN": "在当前项目聊天中打开审阅。",
    "en-US": "Open review in the current project conversation.",
  },
  "shortcuts.command.toggleReview.label": {
    "zh-CN": "切换审阅面板",
    "en-US": "Toggle review panel",
  },
  "shortcuts.command.toggleReview.description": {
    "zh-CN": "显示或隐藏当前聊天的审阅面板。",
    "en-US": "Show or hide review for the current conversation.",
  },
  "shortcuts.command.toggleBottomPanel.label": {
    "zh-CN": "切换底部面板",
    "en-US": "Toggle bottom panel",
  },
  "shortcuts.command.toggleBottomPanel.description": {
    "zh-CN": "显示或隐藏底部终端面板。",
    "en-US": "Show or hide the bottom terminal panel.",
  },
  "shortcuts.command.openTerminal.label": {
    "zh-CN": "打开终端",
    "en-US": "Open terminal",
  },
  "shortcuts.command.openTerminal.description": {
    "zh-CN": "在当前聊天下方打开终端。",
    "en-US": "Open a terminal below the current conversation.",
  },
  "shortcuts.command.openFileTree.label": {
    "zh-CN": "切换文件树",
    "en-US": "Open file tree",
  },
  "shortcuts.command.openFileTree.description": {
    "zh-CN": "在当前项目聊天中打开文件面板。",
    "en-US": "Open the file panel in the current project conversation.",
  },
  "shortcuts.command.openFolder.label": {
    "zh-CN": "打开文件夹",
    "en-US": "Open folder",
  },
  "shortcuts.command.openFolder.description": {
    "zh-CN": "选择本地文件夹并添加为项目。",
    "en-US": "Choose a local folder and add it as a project.",
  },
  "shortcuts.command.attachPhoto.label": {
    "zh-CN": "添加照片",
    "en-US": "Add photo",
  },
  "shortcuts.command.attachPhoto.description": {
    "zh-CN": "将图片添加到当前消息。",
    "en-US": "Add images to the current message.",
  },
  "shortcuts.command.cycleReasoning.label": {
    "zh-CN": "循环切换推理强度",
    "en-US": "Cycle reasoning effort",
  },
  "shortcuts.command.cycleReasoning.description": {
    "zh-CN": "编辑消息时切换到下一个推理档位。",
    "en-US": "Move to the next reasoning level while composing.",
  },
  "shortcuts.command.decreaseReasoning.label": {
    "zh-CN": "降低推理强度",
    "en-US": "Decrease reasoning effort",
  },
  "shortcuts.command.decreaseReasoning.description": {
    "zh-CN": "编辑消息时降低一个推理档位。",
    "en-US": "Move down one reasoning level while composing.",
  },
  "shortcuts.command.increaseReasoning.label": {
    "zh-CN": "提高推理强度",
    "en-US": "Increase reasoning effort",
  },
  "shortcuts.command.increaseReasoning.description": {
    "zh-CN": "编辑消息时提高一个推理档位。",
    "en-US": "Move up one reasoning level while composing.",
  },
  "shortcuts.command.openModelSelector.label": {
    "zh-CN": "打开模型选择器",
    "en-US": "Open model selector",
  },
  "shortcuts.command.openModelSelector.description": {
    "zh-CN": "打开当前编辑器的模型选择器。",
    "en-US": "Open the model selector for the current composer.",
  },
  "shortcuts.command.openProjectSelector.label": {
    "zh-CN": "打开项目选择器",
    "en-US": "Open project selector",
  },
  "shortcuts.command.openProjectSelector.description": {
    "zh-CN": "在新聊天页面打开项目选择器。",
    "en-US": "Open the project selector on the new conversation page.",
  },
  "shortcuts.command.send.label": {
    "zh-CN": "发送消息",
    "en-US": "Send message",
  },
  "shortcuts.command.send.description": {
    "zh-CN": "发送当前编辑器中的消息；Enter 始终可用。",
    "en-US": "Send the current message; Enter always remains available.",
  },
  "shortcuts.command.openCommandMenu.label": {
    "zh-CN": "打开命令菜单",
    "en-US": "Open command menu",
  },
  "shortcuts.command.openCommandMenu.description": {
    "zh-CN": "聚焦编辑器并打开可用命令。",
    "en-US": "Focus the composer and show available commands.",
  },
  "shortcuts.command.settings.label": {
    "zh-CN": "设置",
    "en-US": "Settings",
  },
  "shortcuts.command.settings.description": {
    "zh-CN": "打开常规设置。",
    "en-US": "Open general settings.",
  },
  "shortcuts.command.shortcuts.label": {
    "zh-CN": "显示键盘快捷键",
    "en-US": "Show keyboard shortcuts",
  },
  "shortcuts.command.shortcuts.description": {
    "zh-CN": "打开键盘快捷键设置。",
    "en-US": "Open keyboard shortcut settings.",
  },
  "shortcuts.command.skills.label": {
    "zh-CN": "前往技能",
    "en-US": "Go to skills",
  },
  "shortcuts.command.skills.description": {
    "zh-CN": "打开技能设置。",
    "en-US": "Open skill settings.",
  },
  "shortcuts.command.mcp.label": { "zh-CN": "MCP", "en-US": "MCP" },
  "shortcuts.command.mcp.description": {
    "zh-CN": "打开 MCP 服务器设置。",
    "en-US": "Open MCP server settings.",
  },
  "settings.page.archive.title": { "zh-CN": "归档", "en-US": "Archive" },
  "settings.page.archive.description": {
    "zh-CN":
      "归档对话不会出现在工作区列表；可以恢复，或永久删除对应的 Pi JSONL。",
    "en-US":
      "Archived conversations stay out of workspace lists; restore one or permanently delete its Pi JSONL.",
  },
  "settings.page.models.title": { "zh-CN": "模型", "en-US": "Models" },
  "settings.page.models.description": {
    "zh-CN": "管理 Pi 的 provider 认证与可用 Model scope。",
    "en-US": "Manage Pi provider authentication and the available model scope.",
  },
  "settings.page.packages.title": { "zh-CN": "软件包", "en-US": "Packages" },
  "settings.page.packages.description": {
    "zh-CN": "使用 Pi 的 package manager 安装、更新或移除资源包。",
    "en-US": "Install, update, or remove packages with Pi's package manager.",
  },
  "settings.page.extensions.title": {
    "zh-CN": "扩展",
    "en-US": "Extensions",
  },
  "settings.page.extensions.description": {
    "zh-CN": "查看并切换 Pi 实际解析到的全局与项目扩展。",
    "en-US": "View and toggle the global and project extensions Pi resolved.",
  },
  "settings.page.webuiExtensions.title": {
    "zh-CN": "WebUI 扩展",
    "en-US": "WebUI Extensions",
  },
  "settings.page.webuiExtensions.description": {
    "zh-CN": "管理原生 Web Adapter 与持续可用的 Pi TUI 回退方案。",
    "en-US": "Manage native Web adapters and their permanent Pi TUI fallback.",
  },
  "settings.page.skills.title": { "zh-CN": "技能", "en-US": "Skills" },
  "settings.page.skills.description": {
    "zh-CN": "查看并切换 Pi 实际解析到的全局与项目技能。",
    "en-US": "View and toggle the global and project skills Pi resolved.",
  },
  "settings.page.mcp.title": { "zh-CN": "MCP", "en-US": "MCP" },
  "settings.page.mcp.description": {
    "zh-CN":
      "配置真实的 stdio / Streamable HTTP server、发现 tools，并控制 runtime 注入。",
    "en-US":
      "Configure stdio or Streamable HTTP servers, discover tools, and control runtime injection.",
  },
  "settings.page.developer.title": {
    "zh-CN": "开发者",
    "en-US": "Developer",
  },
  "settings.page.developer.description": {
    "zh-CN": "配置新 session 使用的 Agent runtime 与 Pi Server 连接。",
    "en-US": "Configure the Agent runtime and Pi Server for new sessions.",
  },
  "settings.page.noProject.packages": {
    "zh-CN": "添加工作区项目后才能管理 Pi packages。",
    "en-US": "Add a workspace project before managing Pi packages.",
  },
  "settings.page.noProject.extensions": {
    "zh-CN": "添加工作区项目后才能管理 Pi extensions。",
    "en-US": "Add a workspace project before managing Pi extensions.",
  },
  "settings.page.noProject.skills": {
    "zh-CN": "添加工作区项目后才能管理 Pi skills。",
    "en-US": "Add a workspace project before managing Pi skills.",
  },

  "settings.common.save": { "zh-CN": "保存", "en-US": "Save" },
  "settings.common.saving": { "zh-CN": "保存中…", "en-US": "Saving…" },
  "settings.common.saveFailed": {
    "zh-CN": "保存失败。",
    "en-US": "Save failed.",
  },
  "settings.common.conflict": {
    "zh-CN": "设置已在其他页面更新；当前修改已保留，请检查后重试。",
    "en-US":
      "Settings changed on another page. Your edits were kept; review them and try again.",
  },
  "settings.common.saved": {
    "zh-CN": "设置已保存。",
    "en-US": "Settings saved.",
  },

  "settings.general.localService": {
    "zh-CN": "本地服务",
    "en-US": "Local service",
  },
  "settings.general.localServiceDescription": {
    "zh-CN": "服务只绑定本机；端口设置在重启后生效。",
    "en-US":
      "The service binds to localhost; port changes apply after restart.",
  },
  "settings.general.host": { "zh-CN": "主机", "en-US": "Host" },
  "settings.general.hostDescription": {
    "zh-CN": "未启用认证时固定为本机回环地址。",
    "en-US":
      "Fixed to the local loopback address when authentication is disabled.",
  },
  "settings.general.port": { "zh-CN": "端口", "en-US": "Port" },
  "settings.general.portDescription": {
    "zh-CN": "启动命令与健康检查共用此端口。",
    "en-US": "The start command and health check use this port.",
  },
  "settings.general.openBrowser": {
    "zh-CN": "启动后打开浏览器",
    "en-US": "Open the browser after startup",
  },
  "settings.general.openBrowserDescription": {
    "zh-CN": "CLI 确认健康检查通过后打开页面。",
    "en-US": "Open the page after the CLI confirms the health check passes.",
  },
  "settings.general.saved": {
    "zh-CN": "常规设置已保存。",
    "en-US": "General settings saved.",
  },

  "settings.appearance.interface": { "zh-CN": "界面", "en-US": "Interface" },
  "settings.appearance.interfaceDescription": {
    "zh-CN": "这些设置会写入本机配置并立即应用。",
    "en-US":
      "These settings are written to local configuration and applied immediately.",
  },
  "settings.appearance.theme": { "zh-CN": "主题", "en-US": "Theme" },
  "settings.appearance.themeDescription": {
    "zh-CN": "跟随系统、浅色或深色。",
    "en-US": "Follow the system, use light mode, or use dark mode.",
  },
  "settings.appearance.system": { "zh-CN": "系统", "en-US": "System" },
  "settings.appearance.light": { "zh-CN": "浅色", "en-US": "Light" },
  "settings.appearance.dark": { "zh-CN": "深色", "en-US": "Dark" },
  "settings.appearance.language": { "zh-CN": "语言", "en-US": "Language" },
  "settings.appearance.languageDescription": {
    "zh-CN": "选择应用界面的显示语言。",
    "en-US": "Choose the display language for the application interface.",
  },
  "settings.appearance.chinese": { "zh-CN": "中文", "en-US": "Chinese" },
  "settings.appearance.english": { "zh-CN": "English", "en-US": "English" },
  "settings.appearance.fontSize": { "zh-CN": "字号", "en-US": "Font size" },
  "settings.appearance.fontSizeDescription": {
    "zh-CN": "界面基础字号，范围 12–18px。",
    "en-US": "Base interface font size, from 12–18px.",
  },
  "settings.appearance.sidebarWidth": {
    "zh-CN": "侧边栏宽度",
    "en-US": "Sidebar width",
  },
  "settings.appearance.sidebarWidthDescription": {
    "zh-CN": "桌面侧边栏宽度，范围 240–360px。",
    "en-US": "Desktop sidebar width, from 240–360px.",
  },
  "settings.appearance.saved": {
    "zh-CN": "外观设置已保存。",
    "en-US": "Appearance settings saved.",
  },

  "settings.notifications.title": {
    "zh-CN": "浏览器通知",
    "en-US": "Browser notifications",
  },
  "settings.notifications.description": {
    "zh-CN": "通知权限和开关由当前浏览器保存，不写入项目。",
    "en-US":
      "Notification permission and state are saved by this browser, not the project.",
  },
  "settings.notifications.agentComplete": {
    "zh-CN": "Agent 完成通知",
    "en-US": "Agent completion notifications",
  },
  "settings.notifications.unsupported": {
    "zh-CN": "当前浏览器不支持系统通知。",
    "en-US": "This browser does not support system notifications.",
  },
  "settings.notifications.denied": {
    "zh-CN": "权限已被浏览器阻止；请在站点设置中重新授权。",
    "en-US":
      "Permission was blocked by the browser; allow it again in site settings.",
  },
  "settings.notifications.enabledDescription": {
    "zh-CN": "页面位于后台时，在 Agent 完成或 Runtime 崩溃后发送系统通知。",
    "en-US":
      "Send a system notification when an Agent finishes or a runtime crashes while this page is in the background.",
  },
  "settings.notifications.permissionDenied": {
    "zh-CN": "浏览器没有授予通知权限。",
    "en-US": "The browser did not grant notification permission.",
  },
  "settings.notifications.showFailed": {
    "zh-CN": "浏览器无法显示系统通知。",
    "en-US": "The browser could not show a system notification.",
  },
  "settings.notifications.testBody": {
    "zh-CN": "桌面通知已启用。",
    "en-US": "Desktop notifications are enabled.",
  },

  "settings.archive.empty": {
    "zh-CN": "暂无归档对话。",
    "en-US": "No archived conversations.",
  },
  "settings.archive.independentTask": {
    "zh-CN": "独立任务",
    "en-US": "Standalone task",
  },
  "settings.archive.archivedAt": { "zh-CN": "归档于", "en-US": "Archived" },
  "settings.archive.restore": { "zh-CN": "恢复", "en-US": "Restore" },
  "settings.archive.restoring": {
    "zh-CN": "恢复中…",
    "en-US": "Restoring…",
  },
  "settings.archive.restoreSession": {
    "zh-CN": "恢复对话：{title}",
    "en-US": "Restore conversation: {title}",
  },
  "settings.archive.restoringSession": {
    "zh-CN": "正在恢复对话：{title}",
    "en-US": "Restoring conversation: {title}",
  },
  "settings.archive.restoreFailed": {
    "zh-CN": "恢复归档对话失败。",
    "en-US": "Failed to restore the archived conversation.",
  },
  "settings.archive.restored": {
    "zh-CN": "归档对话已恢复。",
    "en-US": "Archived conversation restored.",
  },
  "settings.archive.delete": { "zh-CN": "删除", "en-US": "Delete" },
  "settings.archive.deleting": { "zh-CN": "删除中…", "en-US": "Deleting…" },
  "settings.archive.deleteSession": {
    "zh-CN": "删除对话：{title}",
    "en-US": "Delete conversation: {title}",
  },
  "settings.archive.deletingSession": {
    "zh-CN": "正在删除对话：{title}",
    "en-US": "Deleting conversation: {title}",
  },
  "settings.archive.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.archive.confirmDeleteTitle": {
    "zh-CN": "永久删除归档对话？",
    "en-US": "Permanently delete this archived conversation?",
  },
  "settings.archive.confirmDelete": {
    "zh-CN": "“{title}”对应的 Pi JSONL 也会被删除。此操作无法撤销。",
    "en-US":
      "The Pi JSONL for “{title}” will also be deleted. This action cannot be undone.",
  },
  "settings.archive.deleteFailed": {
    "zh-CN": "删除归档对话失败。",
    "en-US": "Failed to delete the archived conversation.",
  },
  "settings.archive.deleted": {
    "zh-CN": "归档对话已删除。",
    "en-US": "Archived conversation deleted.",
  },

  "settings.models.auth.oauth": { "zh-CN": "OAuth", "en-US": "OAuth" },
  "settings.models.auth.apiKey": { "zh-CN": "API key", "en-US": "API key" },
  "settings.models.auth.environment": {
    "zh-CN": "环境变量",
    "en-US": "Environment variable",
  },
  "settings.models.availableModels": {
    "zh-CN": "{count} 个可用模型",
    "en-US": "{count} available models",
  },
  "settings.models.modelsWithoutAuth": {
    "zh-CN": "{count} 个模型，尚未配置认证",
    "en-US": "{count} models, authentication not configured",
  },
  "settings.models.noAvailableModels": {
    "zh-CN": "没有可用模型",
    "en-US": "No available models",
  },
  "settings.models.operationFailed": {
    "zh-CN": "模型设置操作失败。",
    "en-US": "Model settings operation failed.",
  },
  "settings.models.conflict": {
    "zh-CN": "模型范围已在其他页面更新；已加载最新状态，请重试。",
    "en-US":
      "The model scope changed on another page. The latest state was loaded; try again.",
  },
  "settings.models.invalidProvider": {
    "zh-CN": "自定义 provider 配置无效。",
    "en-US": "The custom provider configuration is invalid.",
  },
  "settings.models.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.models.delete": { "zh-CN": "删除", "en-US": "Delete" },
  "settings.models.confirmDeleteTitle": {
    "zh-CN": "确认删除 provider？",
    "en-US": "Delete this provider?",
  },
  "settings.models.deleteCustomProvider": {
    "zh-CN": "删除 provider “{provider}”及其自定义配置？",
    "en-US": "Delete provider “{provider}” and its custom configuration?",
  },
  "settings.models.deleteProviderAuth": {
    "zh-CN": "删除 provider “{provider}”的本地认证？",
    "en-US": "Delete the local authentication for provider “{provider}”?",
  },
  "settings.models.cardTitle": {
    "zh-CN": "Provider / Model scope",
    "en-US": "Provider / Model scope",
  },
  "settings.models.cardDescription": {
    "zh-CN":
      "模型 scope 只作用于当前 Pi 已配置认证的模型；自定义 provider 也可以在这里添加和编辑。",
    "en-US":
      "The model scope only applies to models authenticated in the current Pi; custom providers can also be added and edited here.",
  },
  "settings.models.addProvider": {
    "zh-CN": "添加自定义 provider",
    "en-US": "Add custom provider",
  },
  "settings.models.scopeEnabled": {
    "zh-CN": "已启用 scope",
    "en-US": "Scope enabled",
  },
  "settings.models.allAvailableModels": {
    "zh-CN": "全部可用模型",
    "en-US": "All available models",
  },
  "settings.models.enabledSummary": {
    "zh-CN":
      "已启用 {enabled} / {total} 个模型；切换模型后，thinking level 会由 Pi 按该模型能力自动调整。",
    "en-US":
      "{enabled} / {total} models enabled; Pi adjusts the thinking level to match the selected model.",
  },
  "settings.models.searchLabel": {
    "zh-CN": "搜索模型",
    "en-US": "Search models",
  },
  "settings.models.searchPlaceholder": {
    "zh-CN": "按模型名称、ID 或 Provider 搜索",
    "en-US": "Search by model name, ID, or provider",
  },
  "settings.models.filteredSummary": {
    "zh-CN": "显示 {visible} / {total} 个模型",
    "en-US": "Showing {visible} of {total} models",
  },
  "settings.models.noMatchesTitle": {
    "zh-CN": "没有匹配项",
    "en-US": "No matches",
  },
  "settings.models.noMatchesDescription": {
    "zh-CN": "换一个模型名称、ID 或 Provider 试试。",
    "en-US": "Try another model name, ID, or provider.",
  },
  "settings.models.editProvider": {
    "zh-CN": "编辑 {provider}",
    "en-US": "Edit {provider}",
  },
  "settings.models.deleteProvider": {
    "zh-CN": "删除 {provider}",
    "en-US": "Delete {provider}",
  },
  "settings.models.enableModel": {
    "zh-CN": "启用 {model}",
    "en-US": "Enable {model}",
  },
  "settings.models.savedModelsNoAuth": {
    "zh-CN": "已保存模型，但当前没有可用认证。",
    "en-US": "Models are saved, but no usable authentication is available.",
  },
  "settings.models.noCurrentModels": {
    "zh-CN": "没有当前可用模型。",
    "en-US": "No models are currently available.",
  },
  "settings.models.noConfigured": {
    "zh-CN": "当前没有已配置的 provider/model。",
    "en-US": "No providers or models are configured.",
  },
  "settings.provider.addTitle": {
    "zh-CN": "添加自定义 provider",
    "en-US": "Add custom provider",
  },
  "settings.provider.editTitle": {
    "zh-CN": "编辑自定义 provider",
    "en-US": "Edit custom provider",
  },
  "settings.provider.description": {
    "zh-CN": "配置会写入 Pi 的 models.json。API key 留空会保留已有凭据。",
    "en-US":
      "Configuration is written to Pi's models.json. Leave the API key empty to keep existing credentials.",
  },
  "settings.provider.providerId": {
    "zh-CN": "Provider ID",
    "en-US": "Provider ID",
  },
  "settings.provider.displayName": {
    "zh-CN": "显示名称（可选）",
    "en-US": "Display name (optional)",
  },
  "settings.provider.api": { "zh-CN": "API", "en-US": "API" },
  "settings.provider.baseUrl": { "zh-CN": "Base URL", "en-US": "Base URL" },
  "settings.provider.apiKey": { "zh-CN": "API key", "en-US": "API key" },
  "settings.provider.keepConfigured": {
    "zh-CN": "已配置，留空保持不变",
    "en-US": "Configured; leave empty to keep it",
  },
  "settings.provider.optional": { "zh-CN": "可选", "en-US": "Optional" },
  "settings.provider.models": { "zh-CN": "Models", "en-US": "Models" },
  "settings.provider.modelDescription": {
    "zh-CN": "每个 model 使用 provider 的 API 和 Base URL。",
    "en-US": "Each model uses the provider's API and Base URL.",
  },
  "settings.provider.addModel": { "zh-CN": "添加 model", "en-US": "Add model" },
  "settings.provider.modelId": { "zh-CN": "Model ID", "en-US": "Model ID" },
  "settings.provider.modelName": {
    "zh-CN": "显示名称（可选）",
    "en-US": "Display name (optional)",
  },
  "settings.provider.contextWindow": {
    "zh-CN": "Context window",
    "en-US": "Context window",
  },
  "settings.provider.maxOutputTokens": {
    "zh-CN": "Max output tokens",
    "en-US": "Max output tokens",
  },
  "settings.provider.reasoning": { "zh-CN": "支持推理", "en-US": "Reasoning" },
  "settings.provider.images": { "zh-CN": "支持图片", "en-US": "Images" },
  "settings.provider.delete": { "zh-CN": "删除", "en-US": "Delete" },
  "settings.provider.deleteModel": {
    "zh-CN": "删除模型 {model}",
    "en-US": "Delete model {model}",
  },
  "settings.provider.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.provider.save": {
    "zh-CN": "保存 provider",
    "en-US": "Save provider",
  },

  "settings.packages.installTitle": {
    "zh-CN": "安装 Pi 软件包",
    "en-US": "Install Pi package",
  },
  "settings.packages.installDescription": {
    "zh-CN":
      "交给 Pi 的 DefaultPackageManager 安装；支持 npm、git 和本地路径。",
    "en-US":
      "Pass the source to Pi DefaultPackageManager; npm, git, and local paths are supported.",
  },
  "settings.packages.source": {
    "zh-CN": "软件包来源",
    "en-US": "Package source",
  },
  "settings.packages.sourcePlaceholder": {
    "zh-CN": "npm:@scope/package 或 git:https://…",
    "en-US": "npm:@scope/package or git:https://…",
  },
  "settings.packages.scope": {
    "zh-CN": "安装范围",
    "en-US": "Package scope",
  },
  "settings.packages.global": { "zh-CN": "全局", "en-US": "Global" },
  "settings.packages.currentProject": {
    "zh-CN": "当前项目",
    "en-US": "Current Project",
  },
  "settings.packages.install": { "zh-CN": "安装", "en-US": "Install" },
  "settings.packages.configured": {
    "zh-CN": "已配置的软件包",
    "en-US": "Configured packages",
  },
  "settings.packages.itemCountOne": {
    "zh-CN": "{count} 项",
    "en-US": "{count} item",
  },
  "settings.packages.itemCountMany": {
    "zh-CN": "{count} 项",
    "en-US": "{count} items",
  },
  "settings.packages.kind": { "zh-CN": "软件包", "en-US": "packages" },
  "settings.packages.missing": { "zh-CN": "未安装", "en-US": "Not installed" },
  "settings.packages.missingPath": {
    "zh-CN": "Pi settings 中已配置，但本地安装缺失",
    "en-US": "Configured in Pi settings, but missing locally",
  },
  "settings.packages.update": {
    "zh-CN": "更新 {source}",
    "en-US": "Update {source}",
  },
  "settings.packages.remove": {
    "zh-CN": "移除 {source}",
    "en-US": "Remove {source}",
  },
  "settings.packages.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.packages.confirmRemoveTitle": {
    "zh-CN": "移除软件包？",
    "en-US": "Remove package?",
  },
  "settings.packages.confirmRemoveDescription": {
    "zh-CN": "确定要从 Pi 设置中移除 {source} 吗？",
    "en-US": "Remove {source} from Pi settings?",
  },
  "settings.packages.confirmRemove": {
    "zh-CN": "移除",
    "en-US": "Remove",
  },
  "settings.packages.filtered": {
    "zh-CN": "已配置资源筛选规则",
    "en-US": "Resource filter configured",
  },
  "settings.packages.empty": {
    "zh-CN": "Pi 设置中还没有配置软件包。",
    "en-US": "No package is configured in Pi settings.",
  },

  "settings.piExtensions.installTitle": {
    "zh-CN": "安装 Pi 扩展",
    "en-US": "Install Pi extension",
  },
  "settings.piExtensions.installDescription": {
    "zh-CN":
      "支持从 npm、git 或本地路径安装已适配的 Pi runtime 扩展。",
    "en-US":
      "Install adapted Pi runtime extensions from npm, git, or local paths.",
  },
  "settings.piExtensions.source": {
    "zh-CN": "扩展来源",
    "en-US": "Extension source",
  },
  "settings.piExtensions.sourcePlaceholder": {
    "zh-CN": "@tintinweb/pi-subagents 或 git:https://…",
    "en-US": "@tintinweb/pi-subagents or git:https://…",
  },
  "settings.piExtensions.scope": {
    "zh-CN": "安装范围",
    "en-US": "Installation scope",
  },
  "settings.piExtensions.global": { "zh-CN": "全局", "en-US": "Global" },
  "settings.piExtensions.currentProject": {
    "zh-CN": "当前项目",
    "en-US": "Current project",
  },
  "settings.piExtensions.install": { "zh-CN": "安装", "en-US": "Install" },
  "settings.piExtensions.configured": {
    "zh-CN": "已安装的扩展",
    "en-US": "Installed extensions",
  },
  "settings.piExtensions.itemCountOne": {
    "zh-CN": "{count} 个扩展",
    "en-US": "{count} extension",
  },
  "settings.piExtensions.itemCountMany": {
    "zh-CN": "{count} 个扩展",
    "en-US": "{count} extensions",
  },
  "settings.piExtensions.kind": { "zh-CN": "扩展", "en-US": "extensions" },
  "settings.piExtensions.active": { "zh-CN": "运行中", "en-US": "Active" },
  "settings.piExtensions.inactive": { "zh-CN": "未激活", "en-US": "Inactive" },
  "settings.piExtensions.error": { "zh-CN": "错误", "en-US": "Error" },
  "settings.piExtensions.updateAvailable": {
    "zh-CN": "可更新",
    "en-US": "Update available",
  },
  "settings.piExtensions.update": {
    "zh-CN": "更新 {name}",
    "en-US": "Update {name}",
  },
  "settings.piExtensions.remove": {
    "zh-CN": "卸载 {name}",
    "en-US": "Uninstall {name}",
  },
  "settings.piExtensions.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.piExtensions.confirmRemoveTitle": {
    "zh-CN": "卸载扩展？",
    "en-US": "Uninstall extension?",
  },
  "settings.piExtensions.confirmRemoveDescription": {
    "zh-CN": "确定要从 Pi runtime 中卸载 {name} 吗？",
    "en-US": "Uninstall {name} from Pi runtime?",
  },
  "settings.piExtensions.confirmRemove": {
    "zh-CN": "卸载",
    "en-US": "Uninstall",
  },
  "settings.piExtensions.empty": {
    "zh-CN": "还没有安装任何 Pi 扩展。",
    "en-US": "No Pi extensions installed yet.",
  },
  "settings.page.piExtensions.title": {
    "zh-CN": "Pi 扩展",
    "en-US": "Pi Extensions",
  },
  "settings.page.piExtensions.description": {
    "zh-CN": "管理 Pi runtime 中的扩展，如 subagent、coding-agent 等。",
    "en-US": "Manage Pi runtime extensions like subagent, coding-agent, etc.",
  },
  "settings.page.noProject.piExtensions": {
    "zh-CN": "添加工作区项目后才能管理 Pi 扩展。",
    "en-US": "Add a workspace project before managing Pi extensions.",
  },

  "settings.resources.context": {
    "zh-CN": "资源上下文",
    "en-US": "Resource context",
  },
  "settings.resources.contextDescription": {
    "zh-CN":
      "全局设置由 Pi agent 目录管理；项目设置写入所选项目的 .pi/settings.json。",
    "en-US":
      "Global settings are managed by the Pi agent directory; Project settings are written to the selected project's .pi/settings.json.",
  },
  "settings.resources.trusted": { "zh-CN": "已信任", "en-US": "Trusted" },
  "settings.resources.untrusted": { "zh-CN": "未信任", "en-US": "Not trusted" },
  "settings.resources.currentProject": {
    "zh-CN": "当前项目",
    "en-US": "Current project",
  },
  "settings.resources.revokeTrust": {
    "zh-CN": "撤销信任",
    "en-US": "Revoke trust",
  },
  "settings.resources.trustProject": {
    "zh-CN": "信任项目",
    "en-US": "Trust project",
  },
  "settings.resources.noLocalResources": {
    "zh-CN": "项目没有需要信任的本地资源",
    "en-US": "This project has no local resources requiring trust",
  },
  "settings.resources.projectUntrusted": {
    "zh-CN": "项目未受信任；Pi 不会加载项目设置、软件包、技能或扩展。",
    "en-US":
      "The project is not trusted; Pi will not load its settings, packages, skills, or extensions.",
  },
  "settings.resources.readFailed": {
    "zh-CN": "读取 Pi 资源状态失败。",
    "en-US": "Failed to read Pi resource status.",
  },
  "settings.resources.global": { "zh-CN": "全局", "en-US": "Global" },
  "settings.resources.project": {
    "zh-CN": "当前项目",
    "en-US": "Current Project",
  },
  "settings.resources.countOne": {
    "zh-CN": "{count} 项",
    "en-US": "{count} item",
  },
  "settings.resources.countMany": {
    "zh-CN": "{count} 项",
    "en-US": "{count} items",
  },
  "settings.resources.inherited": {
    "zh-CN": "继承自全局",
    "en-US": "Inherited from Global",
  },
  "settings.resources.override": {
    "zh-CN": "项目覆盖",
    "en-US": "Project override",
  },
  "settings.resources.reload": {
    "zh-CN": "等待运行时重新加载",
    "en-US": "Waiting for runtime reload",
  },
  "settings.resources.enabled": {
    "zh-CN": "启用状态",
    "en-US": "Enabled state",
  },
  "settings.resources.toggleEnabled": {
    "zh-CN": "{scope} {name} 启用状态",
    "en-US": "{scope} {name} enabled state",
  },
  "settings.resources.searchLabel": {
    "zh-CN": "搜索 {kind}",
    "en-US": "Search {kind}",
  },
  "settings.resources.searchPlaceholder": {
    "zh-CN": "按名称、软件包或路径搜索 {kind}",
    "en-US": "Search {kind} by name, package, or path",
  },
  "settings.resources.filteredSummary": {
    "zh-CN": "显示 {visible} / {total} 项",
    "en-US": "Showing {visible} of {total} items",
  },
  "settings.resources.noMatches": {
    "zh-CN": "没有匹配项。",
    "en-US": "No matches.",
  },
  "settings.resources.empty": {
    "zh-CN": "此范围内没有解析到{kind}。",
    "en-US": "No {kind} were resolved for this scope.",
  },
  "settings.resources.kind.extensions": {
    "zh-CN": "扩展",
    "en-US": "extensions",
  },
  "settings.resources.kind.skills": { "zh-CN": "技能", "en-US": "skills" },
  "settings.resources.missing": {
    "zh-CN": "源文件缺失",
    "en-US": "Source file missing",
  },
  "settings.resources.source.package": {
    "zh-CN": "软件包",
    "en-US": "Package",
  },
  "settings.resources.source.directory": {
    "zh-CN": "目录",
    "en-US": "Directory",
  },
  "settings.resources.source.explicitPath": {
    "zh-CN": "显式路径",
    "en-US": "Explicit path",
  },

  "settings.runtime.saveFailed": {
    "zh-CN": "保存失败。",
    "en-US": "Save failed.",
  },
  "settings.runtime.testFailed": {
    "zh-CN": "连接测试失败。",
    "en-US": "Connection test failed.",
  },
  "settings.runtime.saved": {
    "zh-CN": "Agent runtime 设置已保存。",
    "en-US": "Agent runtime settings saved.",
  },
  "settings.runtime.connected": {
    "zh-CN": "Pi Server 连接正常。",
    "en-US": "Pi Server connection is healthy.",
  },
  "settings.runtime.title": {
    "zh-CN": "Agent Runtime",
    "en-US": "Agent Runtime",
  },
  "settings.runtime.description": {
    "zh-CN": "默认 runtime 只作用于新 session；已有 session 始终保留原绑定。",
    "en-US":
      "The default runtime only applies to new sessions; existing sessions keep their original binding.",
  },
  "settings.runtime.default": {
    "zh-CN": "新 session 默认值",
    "en-US": "Default for new sessions",
  },
  "settings.runtime.defaultDescription": {
    "zh-CN": "创建时可显式覆盖；不会根据环境变量、端口或进程自动推断。",
    "en-US":
      "Can be overridden when creating a session; never inferred from environment variables, ports, or processes.",
  },
  "settings.runtime.enableClient": {
    "zh-CN": "启用 Pi Client",
    "en-US": "Enable Pi Client",
  },
  "settings.runtime.clientDescription": {
    "zh-CN":
      "使用独立 worker 连接指定的 Pi Server；Pi worker 会清除全部 PI_SERVER_* 变量。",
    "en-US":
      "Use a dedicated worker to connect to the selected Pi Server; the Pi worker clears all PI_SERVER_* variables.",
  },
  "settings.runtime.serverUrl": {
    "zh-CN": "Pi Server URL",
    "en-US": "Pi Server URL",
  },
  "settings.runtime.serverUrlDescription": {
    "zh-CN": "例如 http://127.0.0.1:4217；启用 Pi Client 时必填。",
    "en-US":
      "For example, http://127.0.0.1:4217; required when Pi Client is enabled.",
  },
  "settings.runtime.authToken": {
    "zh-CN": "Authentication token",
    "en-US": "Authentication token",
  },
  "settings.runtime.savedSecurely": {
    "zh-CN": "已安全保存",
    "en-US": "Saved securely",
  },
  "settings.runtime.authDescription": {
    "zh-CN": "Token 只写入权限为 0600 的 secrets 文件，不进入 config.json。",
    "en-US":
      "The token is written only to a 0600 secrets file and never enters config.json.",
  },
  "settings.runtime.keepToken": {
    "zh-CN": "留空以保留已保存 token",
    "en-US": "Leave empty to keep the saved token",
  },
  "settings.runtime.removeToken": { "zh-CN": "移除", "en-US": "Remove" },
  "settings.runtime.keep": { "zh-CN": "保留", "en-US": "Keep" },
  "settings.runtime.response": {
    "zh-CN": "Pi Server 响应正常 · {latency} ms",
    "en-US": "Pi Server responded normally · {latency} ms",
  },
  "settings.runtime.sessionCountOne": {
    "zh-CN": "{count} 个会话",
    "en-US": "{count} session",
  },
  "settings.runtime.sessionCountMany": {
    "zh-CN": "{count} 个会话",
    "en-US": "{count} sessions",
  },
  "settings.runtime.saveCurrent": {
    "zh-CN": "请先保存当前更改",
    "en-US": "Save the current changes first",
  },
  "settings.runtime.testSaved": {
    "zh-CN": "测试已保存配置",
    "en-US": "Test saved configuration",
  },

  "settings.mcp.readFailed": {
    "zh-CN": "读取 MCP 状态失败。",
    "en-US": "Failed to read MCP status.",
  },
  "settings.mcp.requestFailed": {
    "zh-CN": "MCP 请求失败。",
    "en-US": "MCP request failed.",
  },
  "settings.mcp.testFailed": {
    "zh-CN": "MCP 测试失败。",
    "en-US": "MCP test failed.",
  },
  "settings.mcp.invalidInput": {
    "zh-CN": "MCP 服务器设置无效，请检查各字段后重试。",
    "en-US":
      "The MCP server settings are invalid. Review the fields and try again.",
  },
  "settings.mcp.context": { "zh-CN": "MCP 上下文", "en-US": "MCP context" },
  "settings.mcp.description": {
    "zh-CN": "全局服务器对所有运行时生效；项目服务器仅注入所选项目。",
    "en-US":
      "Global servers apply to every runtime; Project servers are injected only into the selected project.",
  },
  "settings.mcp.addServer": {
    "zh-CN": "添加服务器",
    "en-US": "Add server",
  },
  "settings.mcp.noProject": {
    "zh-CN": "尚无工作区项目；仍可配置全局 MCP 服务器。",
    "en-US":
      "There are no workspace projects yet; you can still configure a Global MCP server.",
  },
  "settings.mcp.untrusted": {
    "zh-CN":
      "当前项目未受信任；项目 MCP 服务器不会连接或注入运行时。请先在“扩展”或“技能”页面信任该项目。",
    "en-US":
      "The current project is not trusted; its Project MCP servers will not connect or inject into runtimes. Trust the project on the Extensions / Skills page.",
  },
  "settings.mcp.serverCountOne": {
    "zh-CN": "{count} 项",
    "en-US": "{count} server",
  },
  "settings.mcp.serverCountMany": {
    "zh-CN": "{count} 项",
    "en-US": "{count} servers",
  },
  "settings.mcp.saved": {
    "zh-CN": "{name} 已保存并应用。",
    "en-US": "{name} was saved and applied.",
  },
  "settings.mcp.connectedOne": {
    "zh-CN": "{name} 连接正常 · {latency} ms · {tools} 个工具",
    "en-US": "{name} connected · {latency} ms · {tools} tool",
  },
  "settings.mcp.connectedMany": {
    "zh-CN": "{name} 连接正常 · {latency} ms · {tools} 个工具",
    "en-US": "{name} connected · {latency} ms · {tools} tools",
  },
  "settings.mcp.reconnected": {
    "zh-CN": "{name} 已重新连接。",
    "en-US": "{name} reconnected.",
  },
  "settings.mcp.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.mcp.confirmDeleteTitle": {
    "zh-CN": "确认删除 MCP 服务器？",
    "en-US": "Delete this MCP server?",
  },
  "settings.mcp.deleteConfirm": {
    "zh-CN": "删除 MCP 服务器“{name}”？",
    "en-US": "Delete MCP server “{name}”?",
  },
  "settings.mcp.deleted": {
    "zh-CN": "{name} 已删除。",
    "en-US": "{name} was deleted.",
  },
  "settings.mcp.enabled": {
    "zh-CN": "{name} 已启用。",
    "en-US": "{name} enabled.",
  },
  "settings.mcp.disabled": {
    "zh-CN": "{name} 已停用。",
    "en-US": "{name} disabled.",
  },
  "settings.mcp.toolEnabled": {
    "zh-CN": "{name} 已启用。",
    "en-US": "{name} enabled.",
  },
  "settings.mcp.toolDisabled": {
    "zh-CN": "{name} 已停用。",
    "en-US": "{name} disabled.",
  },
  "settings.mcp.scopeEmpty": {
    "zh-CN": "{scope}范围内尚未配置 MCP 服务器。",
    "en-US": "No {scope} MCP servers are configured.",
  },
  "settings.mcp.globalServers": {
    "zh-CN": "全局服务器",
    "en-US": "Global servers",
  },
  "settings.mcp.projectServers": {
    "zh-CN": "项目服务器",
    "en-US": "Project servers",
  },
  "settings.mcp.enableServer": {
    "zh-CN": "{name} 启用状态",
    "en-US": "{name} enabled state",
  },
  "settings.mcp.enableTool": {
    "zh-CN": "{name} 启用状态",
    "en-US": "{name} enabled state",
  },
  "settings.mcp.status.disabled": {
    "zh-CN": "已停用",
    "en-US": "Disabled",
  },
  "settings.mcp.status.disconnected": {
    "zh-CN": "未连接",
    "en-US": "Disconnected",
  },
  "settings.mcp.status.connecting": {
    "zh-CN": "连接中",
    "en-US": "Connecting",
  },
  "settings.mcp.status.connected": {
    "zh-CN": "已连接",
    "en-US": "Connected",
  },
  "settings.mcp.status.error": { "zh-CN": "错误", "en-US": "Error" },
  "settings.mcp.lastConnected": {
    "zh-CN": "最近连接：{value}",
    "en-US": "Last connected: {value}",
  },
  "settings.mcp.edit": { "zh-CN": "编辑", "en-US": "Edit" },
  "settings.mcp.testConnection": {
    "zh-CN": "测试连接",
    "en-US": "Test connection",
  },
  "settings.mcp.reconnect": { "zh-CN": "重连", "en-US": "Reconnect" },
  "settings.mcp.delete": { "zh-CN": "删除", "en-US": "Delete" },
  "settings.mcp.discoveredTools": {
    "zh-CN": "已发现的工具",
    "en-US": "Discovered tools",
  },
  "settings.mcp.toolsEnabled": {
    "zh-CN": "已启用 {enabled}/{total}",
    "en-US": "{enabled}/{total} enabled",
  },
  "settings.mcp.toolsAfterConnection": {
    "zh-CN": "连接成功后会显示服务器实际提供的工具。",
    "en-US": "The server's exposed tools appear after a successful connection.",
  },
  "settings.mcp.toolsAfterEnable": {
    "zh-CN": "启用服务器或测试连接后即可发现工具。",
    "en-US": "Enable or test the connection to discover tools.",
  },
  "settings.mcp.logs": {
    "zh-CN": "日志（{count}）",
    "en-US": "Logs ({count})",
  },
  "settings.mcp.noLogs": { "zh-CN": "暂无日志。", "en-US": "No logs." },

  "settings.mcpForm.editTitle": {
    "zh-CN": "编辑 MCP 服务器",
    "en-US": "Edit MCP server",
  },
  "settings.mcpForm.addTitle": {
    "zh-CN": "添加 MCP 服务器",
    "en-US": "Add MCP server",
  },
  "settings.mcpForm.description": {
    "zh-CN": "敏感值只写入 SecretStore；保存后 API 不会返回明文。",
    "en-US":
      "Secret fields are written only to SecretStore; the API never returns plaintext after saving.",
  },
  "settings.mcpForm.name": { "zh-CN": "名称", "en-US": "Name" },
  "settings.mcpForm.namespace": {
    "zh-CN": "命名空间",
    "en-US": "Namespace",
  },
  "settings.mcpForm.toolPrefix": {
    "zh-CN": "工具前缀：mcp__{namespace}__",
    "en-US": "Tool prefix: mcp__{namespace}__",
  },
  "settings.mcpForm.scope": { "zh-CN": "作用范围", "en-US": "Scope" },
  "settings.mcpForm.transport": {
    "zh-CN": "传输方式",
    "en-US": "Transport",
  },
  "settings.mcpForm.projectMissing": {
    "zh-CN": "未选择项目",
    "en-US": "No project selected",
  },
  "settings.mcpForm.command": { "zh-CN": "命令", "en-US": "Command" },
  "settings.mcpForm.arguments": {
    "zh-CN": "参数（JSON 字符串数组）",
    "en-US": "Arguments (JSON string array)",
  },
  "settings.mcpForm.cwd": {
    "zh-CN": "工作目录（可选）",
    "en-US": "Working directory (optional)",
  },
  "settings.mcpForm.cwdPlaceholder": {
    "zh-CN": "项目服务器默认使用当前项目目录",
    "en-US": "Project servers use the current project directory by default",
  },
  "settings.mcpForm.environment": {
    "zh-CN": "环境变量",
    "en-US": "Environment",
  },
  "settings.mcpForm.headers": {
    "zh-CN": "HTTP 请求头",
    "en-US": "HTTP headers",
  },
  "settings.mcpForm.timeout": {
    "zh-CN": "超时时间（毫秒）",
    "en-US": "Timeout (ms)",
  },
  "settings.mcpForm.enableAfterSave": {
    "zh-CN": "保存后启用",
    "en-US": "Enable after saving",
  },
  "settings.mcpForm.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.mcpForm.saveConnecting": {
    "zh-CN": "保存并连接",
    "en-US": "Save and connect",
  },
  "settings.mcpForm.argumentsError": {
    "zh-CN": "参数必须是合法的 JSON 字符串数组。",
    "en-US": "Arguments must be a valid JSON string array.",
  },
  "settings.mcpForm.argumentsTypeError": {
    "zh-CN": "参数必须是 JSON 字符串数组。",
    "en-US": "Arguments must be a JSON string array.",
  },
  "settings.mcpForm.timeoutError": {
    "zh-CN": "超时时间必须是整数毫秒。",
    "en-US": "Timeout must be an integer number of milliseconds.",
  },
  "settings.mcpForm.argumentsLimitError": {
    "zh-CN": "参数最多 200 项，且每项不能超过 8192 个字符。",
    "en-US":
      "Arguments are limited to 200 items and 8,192 characters per item.",
  },
  "settings.valueEditor.add": { "zh-CN": "添加", "en-US": "Add" },
  "settings.valueEditor.key": { "zh-CN": "键", "en-US": "Key" },
  "settings.valueEditor.value": { "zh-CN": "值", "en-US": "Value" },
  "settings.valueEditor.savedKeep": {
    "zh-CN": "已保存，留空保持不变",
    "en-US": "Saved; leave empty to keep it",
  },
  "settings.valueEditor.secret": {
    "zh-CN": "敏感值",
    "en-US": "Secret",
  },
  "settings.valueEditor.keyLabel": {
    "zh-CN": "{label}第 {index} 项的键",
    "en-US": "{label} key {index}",
  },
  "settings.valueEditor.valueLabel": {
    "zh-CN": "{label}第 {index} 项的值",
    "en-US": "{label} value {index}",
  },
  "settings.valueEditor.secretLabel": {
    "zh-CN": "{label}第 {index} 项设为敏感值",
    "en-US": "{label} secret {index}",
  },
  "settings.valueEditor.remove": {
    "zh-CN": "删除 {name}",
    "en-US": "Delete {name}",
  },
  "settings.valueEditor.empty": {
    "zh-CN": "未配置。",
    "en-US": "Not configured.",
  },

  "settings.webui.context": {
    "zh-CN": "Adapter 上下文",
    "en-US": "Adapter context",
  },
  "settings.webui.contextDescription": {
    "zh-CN": "授予 Pi 项目信任后才会加载项目 Adapter。",
    "en-US": "Project adapters load only after Pi project trust is granted.",
  },
  "settings.webui.projectTrusted": {
    "zh-CN": "项目已信任",
    "en-US": "Project trusted",
  },
  "settings.webui.globalOnly": {
    "zh-CN": "仅全局",
    "en-US": "Global only",
  },
  "settings.webui.currentProject": {
    "zh-CN": "当前项目",
    "en-US": "Current project",
  },
  "settings.webui.enabled": {
    "zh-CN": "启用 {name}",
    "en-US": "{name} enabled",
  },
  "settings.webui.nativeRendering": {
    "zh-CN": "原生 Web 渲染",
    "en-US": "Native Web rendering",
  },
  "settings.webui.nativeDescription": {
    "zh-CN": "关闭后将通过 Virtual TUI 运行原始 Pi UI。",
    "en-US": "Turn off to run the original Pi UI through Virtual TUI.",
  },
  "settings.webui.conflict": {
    "zh-CN": "冲突选择",
    "en-US": "Conflict selection",
  },
  "settings.webui.conflictDescription": {
    "zh-CN": "多个 Adapter 优先级相同时，自动选择会回退到 TUI。",
    "en-US":
      "Automatic selection falls back to TUI when multiple adapters have equal priority.",
  },
  "settings.webui.adapterSelection": {
    "zh-CN": "Adapter 选择",
    "en-US": "Adapter selection",
  },
  "settings.webui.automatic": { "zh-CN": "自动", "en-US": "Automatic" },
  "settings.webui.available": {
    "zh-CN": "可用 Adapter",
    "en-US": "Available adapters",
  },
  "settings.webui.adapter": { "zh-CN": "Adapter", "en-US": "Adapter" },
  "settings.webui.target": { "zh-CN": "目标", "en-US": "Target" },
  "settings.webui.supported": {
    "zh-CN": "支持范围",
    "en-US": "Supported",
  },
  "settings.webui.tested": { "zh-CN": "已测试", "en-US": "Tested" },
  "settings.webui.probe": { "zh-CN": "探测", "en-US": "Probe" },
  "settings.webui.userSelected": {
    "zh-CN": "用户选择",
    "en-US": "User-selected",
  },
  "settings.webui.active": { "zh-CN": "当前生效", "en-US": "Active" },
  "settings.webui.fallback": {
    "zh-CN": "回退方案：Pi TUI 可用。",
    "en-US": "Fallback: Pi TUI available.",
  },
  "settings.webui.noAdapters": {
    "zh-CN": "未找到 WebUI Adapter",
    "en-US": "No WebUI adapters found",
  },
  "settings.webui.noAdaptersDescription": {
    "zh-CN": "已检查内置、外部、开发和受信任的项目位置。",
    "en-US":
      "Built-in, external, development, and trusted project locations were checked.",
  },
  "settings.webui.status.tested": {
    "zh-CN": "已测试",
    "en-US": "Tested",
  },
  "settings.webui.status.compatibleByProbe": {
    "zh-CN": "探测兼容",
    "en-US": "Compatible by probe",
  },
  "settings.webui.status.unknown": {
    "zh-CN": "未知",
    "en-US": "Unknown",
  },
  "settings.webui.status.incompatible": {
    "zh-CN": "不兼容",
    "en-US": "Incompatible",
  },
  "settings.webui.status.disabled": {
    "zh-CN": "已禁用",
    "en-US": "Disabled",
  },
  "settings.webui.status.conflict": {
    "zh-CN": "冲突",
    "en-US": "Conflict",
  },
  "settings.webui.status.tui": {
    "zh-CN": "优先 TUI",
    "en-US": "Prefer TUI",
  },
  "settings.webui.status.error": {
    "zh-CN": "错误",
    "en-US": "Error",
  },
  "settings.webui.source.builtin": {
    "zh-CN": "内置",
    "en-US": "Built-in",
  },
  "settings.webui.source.project": {
    "zh-CN": "项目",
    "en-US": "Project",
  },
  "settings.webui.source.development": {
    "zh-CN": "开发",
    "en-US": "Development",
  },
  "settings.webui.source.external": {
    "zh-CN": "外部",
    "en-US": "External",
  },
  "settings.webui.notProbed": {
    "zh-CN": "未探测",
    "en-US": "Not probed",
  },
  "settings.webui.statusFallback": {
    "zh-CN": "Pi TUI 仍可作为回退方案。",
    "en-US": "Pi TUI remains available as fallback.",
  },
  "settings.webui.capabilityProbe": {
    "zh-CN": "能力探测",
    "en-US": "Capability probe",
  },
  "settings.webui.noPinnedVersions": {
    "zh-CN": "未固定版本",
    "en-US": "No pinned versions",
  },
  "settings.webui.probePassed": {
    "zh-CN": "已通过",
    "en-US": "Passed",
  },
  "settings.webui.probeNotPassed": {
    "zh-CN": "本会话尚未通过",
    "en-US": "Not passed in this session",
  },
  "settings.webui.updateFailed": {
    "zh-CN": "更新 WebUI 扩展失败。",
    "en-US": "WebUI extension update failed.",
  },
  "settings.webui.readFailed": {
    "zh-CN": "读取 WebUI 扩展状态失败。",
    "en-US": "Failed to read WebUI extension status.",
  },
  "settings.webui.searchLabel": {
    "zh-CN": "搜索 Adapter",
    "en-US": "Search adapters",
  },
  "settings.webui.searchPlaceholder": {
    "zh-CN": "按名称、软件包或路径搜索 Adapter",
    "en-US": "Search adapters by name, package, or path",
  },
} as const

export type MessageKey = keyof typeof messages
export type Translator = (
  key: MessageKey,
  values?: Record<string, string | number>
) => string

export function translate(
  locale: Locale,
  key: MessageKey,
  values?: Record<string, string | number>
) {
  const template = messages[key][locale]
  if (!values) return template
  return Object.entries(values).reduce<string>(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    template
  )
}

export function createTranslator(locale: Locale): Translator {
  return (key, values) => translate(locale, key, values)
}

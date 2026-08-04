export const locales = ["zh-CN", "en-US"] as const
export type Locale = (typeof locales)[number]

export const DEFAULT_LOCALE: Locale = "zh-CN"

const messages = {
  "ui.close": { "zh-CN": "关闭", "en-US": "Close" },
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

  "composer.reasoningEffort": {
    "zh-CN": "推理强度",
    "en-US": "Reasoning effort",
  },
  "composer.reasoningLevel": {
    "zh-CN": "推理：{level}",
    "en-US": "Reasoning: {level}",
  },
  "composer.reasoningShortcut": {
    "zh-CN": "Alt+Shift+R 切换推理强度",
    "en-US": "Alt+Shift+R cycles reasoning effort",
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
  "workspace.project.archiveTasks": {
    "zh-CN": "归档任务",
    "en-US": "Archive tasks",
  },
  "workspace.project.remove": { "zh-CN": "移除", "en-US": "Remove" },
  "workspace.project.conversationCount": {
    "zh-CN": "{count} 个对话串",
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
    "zh-CN": "归档 {name} 中的任务？",
    "en-US": "Archive tasks in {name}?",
  },
  "workspace.project.archiveDescription": {
    "zh-CN":
      "将从导航中移除 {count} 个任务；正在运行的任务会先停止。项目目录和 Pi session 文件不会删除。",
    "en-US":
      "This removes {count} tasks from navigation and stops any that are running. The project folder and Pi session files are kept.",
  },
  "workspace.project.archiveConfirm": {
    "zh-CN": "归档 {count} 个任务",
    "en-US": "Archive {count} tasks",
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
  "settings.nav.archive": { "zh-CN": "归档", "en-US": "Archive" },
  "settings.nav.models": { "zh-CN": "模型", "en-US": "Models" },
  "settings.nav.packages": { "zh-CN": "Packages", "en-US": "Packages" },
  "settings.nav.extensions": { "zh-CN": "Extensions", "en-US": "Extensions" },
  "settings.nav.webuiExtensions": {
    "zh-CN": "WebUI Extensions",
    "en-US": "WebUI Extensions",
  },
  "settings.nav.skills": { "zh-CN": "Skills", "en-US": "Skills" },
  "settings.nav.mcp": { "zh-CN": "MCP", "en-US": "MCP" },
  "settings.nav.developer": { "zh-CN": "Developer", "en-US": "Developer" },
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
  "settings.page.packages.title": { "zh-CN": "Packages", "en-US": "Packages" },
  "settings.page.packages.description": {
    "zh-CN": "使用 Pi 的 package manager 安装、更新或移除资源包。",
    "en-US": "Install, update, or remove packages with Pi's package manager.",
  },
  "settings.page.extensions.title": {
    "zh-CN": "Extensions",
    "en-US": "Extensions",
  },
  "settings.page.extensions.description": {
    "zh-CN": "查看并切换 Pi 实际解析到的全局与项目扩展。",
    "en-US": "View and toggle the global and project extensions Pi resolved.",
  },
  "settings.page.webuiExtensions.title": {
    "zh-CN": "WebUI Extensions",
    "en-US": "WebUI Extensions",
  },
  "settings.page.webuiExtensions.description": {
    "zh-CN": "管理原生 Web Adapter 与持续可用的 Pi TUI 回退方案。",
    "en-US": "Manage native Web adapters and their permanent Pi TUI fallback.",
  },
  "settings.page.skills.title": { "zh-CN": "Skills", "en-US": "Skills" },
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
    "zh-CN": "Developer",
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
  "settings.provider.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.provider.save": {
    "zh-CN": "保存 provider",
    "en-US": "Save provider",
  },

  "settings.packages.installTitle": {
    "zh-CN": "安装 Pi package",
    "en-US": "Install Pi package",
  },
  "settings.packages.installDescription": {
    "zh-CN":
      "直接交给 Pi DefaultPackageManager；支持 npm、git 和本地路径 source。",
    "en-US":
      "Pass the source to Pi DefaultPackageManager; npm, git, and local paths are supported.",
  },
  "settings.packages.source": {
    "zh-CN": "Package source",
    "en-US": "Package source",
  },
  "settings.packages.sourcePlaceholder": {
    "zh-CN": "npm:@scope/package 或 git:https://…",
    "en-US": "npm:@scope/package or git:https://…",
  },
  "settings.packages.scope": {
    "zh-CN": "Package scope",
    "en-US": "Package scope",
  },
  "settings.packages.global": { "zh-CN": "Global", "en-US": "Global" },
  "settings.packages.currentProject": {
    "zh-CN": "Current Project",
    "en-US": "Current Project",
  },
  "settings.packages.install": { "zh-CN": "安装", "en-US": "Install" },
  "settings.packages.configured": {
    "zh-CN": "已配置 Packages",
    "en-US": "Configured packages",
  },
  "settings.packages.items": {
    "zh-CN": "{count} 项",
    "en-US": "{count} items",
  },
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
    "zh-CN": "移除 Package？",
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
    "zh-CN": "资源 filter 已配置",
    "en-US": "Resource filter configured",
  },
  "settings.packages.empty": {
    "zh-CN": "Pi settings 中还没有配置 package。",
    "en-US": "No package is configured in Pi settings.",
  },

  "settings.resources.context": {
    "zh-CN": "资源上下文",
    "en-US": "Resource context",
  },
  "settings.resources.contextDescription": {
    "zh-CN":
      "Global 设置由 Pi agent 目录管理；Project 设置写入选中项目的 .pi/settings.json。",
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
    "zh-CN":
      "项目未受信任；Pi 不会加载项目 settings、packages、skills 或 extensions。",
    "en-US":
      "The project is not trusted; Pi will not load its settings, packages, skills, or extensions.",
  },
  "settings.resources.readFailed": {
    "zh-CN": "读取 Pi 资源状态失败。",
    "en-US": "Failed to read Pi resource status.",
  },
  "settings.resources.global": { "zh-CN": "Global", "en-US": "Global" },
  "settings.resources.project": {
    "zh-CN": "Current Project",
    "en-US": "Current Project",
  },
  "settings.resources.count": {
    "zh-CN": "{count} 项",
    "en-US": "{count} items",
  },
  "settings.resources.inherited": {
    "zh-CN": "继承 Global",
    "en-US": "Inherited from Global",
  },
  "settings.resources.override": {
    "zh-CN": "Project override",
    "en-US": "Project override",
  },
  "settings.resources.reload": {
    "zh-CN": "等待 runtime reload",
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
    "en-US": "Search {kind}s",
  },
  "settings.resources.searchPlaceholder": {
    "zh-CN": "按名称、package 或路径搜索 {kind}",
    "en-US": "Search {kind}s by name, package, or path",
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
    "zh-CN": "没有解析到这个 scope 的 {kind}。",
    "en-US": "No {kind} was resolved for this scope.",
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
  "settings.mcp.context": { "zh-CN": "MCP context", "en-US": "MCP context" },
  "settings.mcp.description": {
    "zh-CN":
      "Global server 对所有 runtime 生效；Project server 仅注入选中项目。",
    "en-US":
      "Global servers apply to every runtime; Project servers are injected only into the selected project.",
  },
  "settings.mcp.addServer": { "zh-CN": "添加 server", "en-US": "Add server" },
  "settings.mcp.noProject": {
    "zh-CN": "尚无工作区项目；仍可配置 Global MCP server。",
    "en-US":
      "There are no workspace projects yet; you can still configure a Global MCP server.",
  },
  "settings.mcp.untrusted": {
    "zh-CN":
      "当前项目未受信任；Project MCP server 不会连接或注入 runtime。请在 Extensions / Skills 页面完成项目信任。",
    "en-US":
      "The current project is not trusted; its Project MCP servers will not connect or inject into runtimes. Trust the project on the Extensions / Skills page.",
  },
  "settings.mcp.serverCount": {
    "zh-CN": "{count} 项",
    "en-US": "{count} items",
  },
  "settings.mcp.saved": {
    "zh-CN": "{name} 已保存并应用。",
    "en-US": "{name} was saved and applied.",
  },
  "settings.mcp.connected": {
    "zh-CN": "{name} 连接正常 · {latency} ms · {tools} tools",
    "en-US": "{name} connected · {latency} ms · {tools} tools",
  },
  "settings.mcp.reconnected": {
    "zh-CN": "{name} 已重新连接。",
    "en-US": "{name} reconnected.",
  },
  "settings.mcp.cancel": { "zh-CN": "取消", "en-US": "Cancel" },
  "settings.mcp.confirmDeleteTitle": {
    "zh-CN": "确认删除 MCP server？",
    "en-US": "Delete this MCP server?",
  },
  "settings.mcp.deleteConfirm": {
    "zh-CN": "删除 MCP server “{name}”？",
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
    "zh-CN": "尚未配置 {scope} MCP server。",
    "en-US": "No {scope} MCP servers are configured.",
  },
  "settings.mcp.globalServers": {
    "zh-CN": "Global servers",
    "en-US": "Global servers",
  },
  "settings.mcp.projectServers": {
    "zh-CN": "Project servers",
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
    "zh-CN": "Discovered tools",
    "en-US": "Discovered tools",
  },
  "settings.mcp.toolsEnabled": {
    "zh-CN": "{enabled}/{total} enabled",
    "en-US": "{enabled}/{total} enabled",
  },
  "settings.mcp.toolsAfterConnection": {
    "zh-CN": "连接成功后会显示 server 实际暴露的 tools。",
    "en-US": "The server's exposed tools appear after a successful connection.",
  },
  "settings.mcp.toolsAfterEnable": {
    "zh-CN": "启用或测试连接后发现 tools。",
    "en-US": "Enable or test the connection to discover tools.",
  },
  "settings.mcp.logs": { "zh-CN": "Logs ({count})", "en-US": "Logs ({count})" },
  "settings.mcp.noLogs": { "zh-CN": "暂无日志。", "en-US": "No logs." },

  "settings.mcpForm.editTitle": {
    "zh-CN": "编辑 MCP server",
    "en-US": "Edit MCP server",
  },
  "settings.mcpForm.addTitle": {
    "zh-CN": "添加 MCP server",
    "en-US": "Add MCP server",
  },
  "settings.mcpForm.description": {
    "zh-CN": "Secret 字段只写入 SecretStore；保存后 API 不会返回明文。",
    "en-US":
      "Secret fields are written only to SecretStore; the API never returns plaintext after saving.",
  },
  "settings.mcpForm.name": { "zh-CN": "名称", "en-US": "Name" },
  "settings.mcpForm.namespace": { "zh-CN": "Namespace", "en-US": "Namespace" },
  "settings.mcpForm.toolPrefix": {
    "zh-CN": "工具前缀：mcp__{namespace}__",
    "en-US": "Tool prefix: mcp__{namespace}__",
  },
  "settings.mcpForm.scope": { "zh-CN": "Scope", "en-US": "Scope" },
  "settings.mcpForm.transport": { "zh-CN": "Transport", "en-US": "Transport" },
  "settings.mcpForm.projectMissing": {
    "zh-CN": "未选择项目",
    "en-US": "No project selected",
  },
  "settings.mcpForm.command": { "zh-CN": "Command", "en-US": "Command" },
  "settings.mcpForm.arguments": {
    "zh-CN": "Arguments (JSON string array)",
    "en-US": "Arguments (JSON string array)",
  },
  "settings.mcpForm.cwd": {
    "zh-CN": "Working directory（可选）",
    "en-US": "Working directory (optional)",
  },
  "settings.mcpForm.cwdPlaceholder": {
    "zh-CN": "项目级 server 默认使用当前项目目录",
    "en-US": "Project servers use the current project directory by default",
  },
  "settings.mcpForm.environment": {
    "zh-CN": "Environment",
    "en-US": "Environment",
  },
  "settings.mcpForm.headers": {
    "zh-CN": "HTTP headers",
    "en-US": "HTTP headers",
  },
  "settings.mcpForm.timeout": {
    "zh-CN": "Timeout (ms)",
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
    "zh-CN": "Arguments 必须是合法的 JSON 字符串数组。",
    "en-US": "Arguments must be a valid JSON string array.",
  },
  "settings.mcpForm.argumentsTypeError": {
    "zh-CN": "Arguments 必须是 JSON 字符串数组。",
    "en-US": "Arguments must be a JSON string array.",
  },
  "settings.mcpForm.timeoutError": {
    "zh-CN": "Timeout 必须是整数毫秒。",
    "en-US": "Timeout must be an integer number of milliseconds.",
  },
  "settings.valueEditor.add": { "zh-CN": "添加", "en-US": "Add" },
  "settings.valueEditor.key": { "zh-CN": "Key", "en-US": "Key" },
  "settings.valueEditor.value": { "zh-CN": "Value", "en-US": "Value" },
  "settings.valueEditor.savedKeep": {
    "zh-CN": "已保存，留空保持不变",
    "en-US": "Saved; leave empty to keep it",
  },
  "settings.valueEditor.secret": { "zh-CN": "Secret", "en-US": "Secret" },
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
    "zh-CN": "仅 Global",
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
    "zh-CN": "更新 WebUI Extension 失败。",
    "en-US": "WebUI extension update failed.",
  },
  "settings.webui.readFailed": {
    "zh-CN": "读取 WebUI Extension 状态失败。",
    "en-US": "Failed to read WebUI extension status.",
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

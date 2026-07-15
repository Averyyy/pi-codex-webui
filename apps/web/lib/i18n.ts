export const locales = ["zh-CN", "en-US"] as const
export type Locale = (typeof locales)[number]

export const DEFAULT_LOCALE: Locale = "zh-CN"

const messages = {
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
    "zh-CN": "归档对话不会出现在工作区列表；删除会永久移除对应的 Pi JSONL。",
    "en-US":
      "Archived conversations stay out of workspace lists; deleting one permanently removes its Pi JSONL.",
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
    "zh-CN": "管理原生 Web adapter 及其永久 Pi TUI fallback。",
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
  "settings.archive.delete": { "zh-CN": "删除", "en-US": "Delete" },
  "settings.archive.confirmDelete": {
    "zh-CN": "永久删除这个归档对话？对应的 Pi JSONL 也会被删除。",
    "en-US":
      "Permanently delete this archived conversation? Its Pi JSONL will also be deleted.",
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
    "zh-CN": "Adapter context",
    "en-US": "Adapter context",
  },
  "settings.webui.contextDescription": {
    "zh-CN": "Project adapters load only after Pi project trust is granted.",
    "en-US": "Project adapters load only after Pi project trust is granted.",
  },
  "settings.webui.projectTrusted": {
    "zh-CN": "Project trusted",
    "en-US": "Project trusted",
  },
  "settings.webui.globalOnly": {
    "zh-CN": "Global only",
    "en-US": "Global only",
  },
  "settings.webui.currentProject": {
    "zh-CN": "Current project",
    "en-US": "Current project",
  },
  "settings.webui.enabled": {
    "zh-CN": "{name} enabled",
    "en-US": "{name} enabled",
  },
  "settings.webui.nativeRendering": {
    "zh-CN": "Native Web rendering",
    "en-US": "Native Web rendering",
  },
  "settings.webui.nativeDescription": {
    "zh-CN": "Turn off to run the original Pi UI through Virtual TUI.",
    "en-US": "Turn off to run the original Pi UI through Virtual TUI.",
  },
  "settings.webui.conflict": {
    "zh-CN": "Conflict selection",
    "en-US": "Conflict selection",
  },
  "settings.webui.conflictDescription": {
    "zh-CN":
      "Automatic selection falls back to TUI when multiple adapters have equal priority.",
    "en-US":
      "Automatic selection falls back to TUI when multiple adapters have equal priority.",
  },
  "settings.webui.adapterSelection": {
    "zh-CN": "Adapter selection",
    "en-US": "Adapter selection",
  },
  "settings.webui.automatic": { "zh-CN": "Automatic", "en-US": "Automatic" },
  "settings.webui.available": {
    "zh-CN": "Available adapters",
    "en-US": "Available adapters",
  },
  "settings.webui.adapter": { "zh-CN": "Adapter", "en-US": "Adapter" },
  "settings.webui.target": { "zh-CN": "Target", "en-US": "Target" },
  "settings.webui.supported": { "zh-CN": "Supported", "en-US": "Supported" },
  "settings.webui.tested": { "zh-CN": "Tested", "en-US": "Tested" },
  "settings.webui.probe": { "zh-CN": "Probe", "en-US": "Probe" },
  "settings.webui.userSelected": {
    "zh-CN": "User-selected",
    "en-US": "User-selected",
  },
  "settings.webui.active": { "zh-CN": "Active", "en-US": "Active" },
  "settings.webui.fallback": {
    "zh-CN": "Fallback: Pi TUI available.",
    "en-US": "Fallback: Pi TUI available.",
  },
  "settings.webui.noAdapters": {
    "zh-CN": "No WebUI adapters found",
    "en-US": "No WebUI adapters found",
  },
  "settings.webui.noAdaptersDescription": {
    "zh-CN":
      "Built-in, external, development, and trusted project locations were checked.",
    "en-US":
      "Built-in, external, development, and trusted project locations were checked.",
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

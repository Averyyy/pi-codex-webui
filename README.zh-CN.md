<div align="center">

# pi-web-codex

### 为 Pi coding-agent 工作流打造的本地 Web Host

在快速、可检查、可脚本化的浏览器界面中运行 Pi 会话、项目、插件与开发工具，数据始终留在本机。

[![npm 版本](https://img.shields.io/npm/v/pi-web-codex?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/pi-web-codex)
[![npm 下载量](https://img.shields.io/npm/dm/pi-web-codex?color=0ea5e9&logo=npm&logoColor=white)](https://www.npmjs.com/package/pi-web-codex)
[![GitHub Stars](https://img.shields.io/github/stars/Averyyy/pi-codex-webui?style=flat&color=f59e0b&logo=github)](https://github.com/Averyyy/pi-codex-webui)
[![许可证](https://img.shields.io/badge/license-MIT-16a34a.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)

<br />

**[English](README.md)** · **[NPM](https://www.npmjs.com/package/pi-web-codex)** · **[GitHub](https://github.com/Averyyy/pi-codex-webui)**

</div>

## 先看界面

<p align="center">
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-9.png" alt="实时 Pi 会话与环境检查器" width="49%" />
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-7.png" alt="插件市场与集成管理" width="49%" />
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-3.png" alt="可搜索的归档任务" width="49%" />
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-4.png" alt="外观与主题设置" width="49%" />
</p>

## 核心亮点

| | 能力 | 实际体验 |
| --- | --- | --- |
| ⚡ | **实时 Pi 会话** | 支持提示词流式输出、工具事件、中止、重试、压缩、模型与思考级别控制。 |
| 🧭 | **项目与会话历史** | 浏览 JSONL 项目、全文搜索、fork/clone 会话、切换分支，并导入导出 JSONL 或 HTML。 |
| 🧩 | **原生 WebUI 插件** | 在浏览器中渲染对话框、编辑器、组件和浮层，同时保留 Pi 原生 TUI 作为回退路径。 |
| 🔌 | **MCP 与运行时控制** | 配置 stdio 或 Streamable HTTP 服务，查看连接状态，并安全地重载空闲运行时。 |
| 🛠️ | **开发者可观测性** | 在一个界面中查看只读文件、Git 分支/提交/worktree、环境信息与运行时诊断。 |
| 📦 | **本地优先交付** | 独立 CLI、可安装 PWA、原子化设置、可选通知，无需托管账号。 |

## 安装与运行

需要 **Node.js 22.19+** 或 **Node.js 24+**。不支持 Node.js 23。

```bash
npm install --global pi-web-codex
pi-web-codex
```

服务就绪后会打开 <http://127.0.0.1:1816>。使用 `pi-web-codex --help` 查看全部 CLI 选项。

## 本地开发

```bash
npx pnpm@11.12.0 install
npx pnpm@11.12.0 dev
```

打开 <http://127.0.0.1:1816>，发布前运行以下检查：

```bash
npx pnpm@11.12.0 test
npx pnpm@11.12.0 typecheck
npx pnpm@11.12.0 lint
npx pnpm@11.12.0 build
```

完整的打包发布检查：

```bash
npx pnpm@11.12.0 release:verify
```

该命令会构建便携 standalone 目录，验证 NPM tarball 同时包含两个已编译 worker 且不含 TypeScript 业务源码，将其安装到临时全局目录，并通过健康检查启动已安装的 CLI。

## 扩展 Host

WebUI Extensions 是现有 Pi Extensions 的可选适配器，可以渐进式地用浏览器原生 Shadow DOM 视图替换已知命令和渲染器。当适配器缺失、禁用、不兼容、冲突或运行时失败时，Host 会保留原始 Pi 行为与 Virtual TUI。

- [插件作者指南](webui-extensions/README.md)
- [插件架构](docs/webui-extensions/architecture.md)
- [核心架构](docs/architecture.md)

## 项目状态

当前里程碑覆盖生产级 Host 生命周期、健康与设置 API、真实 Pi JSONL 项目与独立任务、隔离 Pi SDK worker、会话生命周期操作、插件设置、MCP 管理、项目 Git/文件检查、PWA 缓存和运行时诊断。所有 UI 都对应真实的后端操作。

## 许可证

[MIT](LICENSE)

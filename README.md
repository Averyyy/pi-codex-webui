<div align="center">

# pi-web-codex

### A polished local web host for Pi coding-agent workflows

Run Pi sessions, projects, extensions, and developer tools in a fast browser UI that stays local, inspectable, and scriptable.

[![npm version](https://img.shields.io/npm/v/pi-web-codex?color=cb3837&logo=npm&logoColor=white)](https://www.npmjs.com/package/pi-web-codex)
[![npm downloads](https://img.shields.io/npm/dm/pi-web-codex?color=0ea5e9&logo=npm&logoColor=white)](https://www.npmjs.com/package/pi-web-codex)
[![GitHub stars](https://img.shields.io/github/stars/Averyyy/pi-codex-webui?style=flat&color=f59e0b&logo=github)](https://github.com/Averyyy/pi-codex-webui)
[![License](https://img.shields.io/badge/license-MIT-16a34a.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-43853d?logo=node.js&logoColor=white)](https://nodejs.org/)

<br />

**[中文文档](README.zh-CN.md)** · **[NPM](https://www.npmjs.com/package/pi-web-codex)** · **[GitHub](https://github.com/Averyyy/pi-codex-webui)**

</div>

## See it in action

<p align="center">
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-9.png" alt="Pi session with streaming output and environment inspector" width="49%" />
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-7.png" alt="Extension marketplace and integrations" width="49%" />
</p>
<p align="center">
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-3.png" alt="Searchable archived tasks" width="49%" />
  <img src="https://raw.githubusercontent.com/Averyyy/pi-codex-webui/main/reference/image-4.png" alt="Appearance and theme settings" width="49%" />
</p>

## Why pi-web-codex

| | Capability | What it means in practice |
| --- | --- | --- |
| ⚡ | **Real-time Pi sessions** | Prompt streaming, tool events, abort, retry, compaction, model and thinking controls. |
| 🧭 | **Projects and session history** | Browse JSONL projects, search full text, fork or clone sessions, navigate branches, and export/import JSONL or HTML. |
| 🧩 | **Native WebUI Extensions** | Render dialogs, editors, widgets and overlays in the browser while preserving Pi's original TUI fallback. |
| 🔌 | **MCP and runtime controls** | Configure stdio or Streamable HTTP servers, inspect connection status, and reload idle runtimes safely. |
| 🛠️ | **Developer visibility** | Read-only files, Git branch/commit/worktree state, environment details and runtime diagnostics in one place. |
| 📦 | **Local-first delivery** | A standalone CLI, installable PWA, atomic settings, optional notifications and no hosted account required. |

## Install and run

Requires **Node.js 22.19+** or **Node.js 24+**. Node.js 23 is not supported.

```bash
npm install --global pi-web-codex
pi-web-codex
```

Or install it as a Pi package and start it from a session:

```bash
pi install npm:pi-web-codex
```

Then run `/pi-web-codex` inside Pi. The host opens <http://127.0.0.1:1816> when the server is ready. Use `pi-web-codex --help` to see all CLI options.

## Development

```bash
npx pnpm@11.12.0 install
npx pnpm@11.12.0 dev
```

Open <http://127.0.0.1:1816>, then run the focused checks below before publishing:

```bash
npx pnpm@11.12.0 test
npx pnpm@11.12.0 typecheck
npx pnpm@11.12.0 lint
npx pnpm@11.12.0 build
```

For the complete packed-release check:

```bash
npx pnpm@11.12.0 release:verify
```

This builds the portable standalone tree, verifies the NPM tarball contains both compiled workers and no TypeScript business source, installs it into a temporary global prefix, and starts the installed CLI through its health check.

## Extending the host

WebUI Extensions are optional adapters for existing Pi Extensions. They can progressively replace known commands and renderers with browser-native Shadow DOM views. If an adapter is absent, disabled, incompatible, conflicting or fails at runtime, the original Pi behavior and Virtual TUI remain available.

- [Extension author guide](webui-extensions/README.md)
- [Extension architecture](docs/webui-extensions/architecture.md)
- [Core architecture](docs/architecture.md)

## Project status

The current milestone covers the production host lifecycle, health and settings APIs, real Pi JSONL projects and standalone tasks, isolated Pi SDK workers, session lifecycle operations, extension settings, MCP management, project Git/file inspection, PWA caching and runtime diagnostics. No UI is presented without a backing operation.

## License

[MIT](LICENSE)

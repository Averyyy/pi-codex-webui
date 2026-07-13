# pi-web-codex 架构设计文档

> Status: Proposed
> Package: `pi-web-codex`
> CLI command: `pi-web-codex`
> Default URL: `http://127.0.0.1:1816`
> Default runtime: `pi`

---

## 1. 项目目标

`pi-web-codex` 是一个独立的、本地运行的 Pi Web 前端。

项目从零开始建设，不复用旧 Tau 项目的前端、状态管理、Web Server extension 或端口分配机制。

核心目标：

1. 使用 Next.js 重建完整的 Pi Web UI。
2. 默认运行于 `http://127.0.0.1:1816`。
3. 无论创建多少会话，对外都只监听一个端口。
4. 支持 Pi 的历史会话、分支、工具调用、模型、thinking、compaction 等能力。
5. 支持在设置中选择使用 `pi` 或 `pi-client` runtime。
6. 默认使用 `pi`。
7. runtime 选择持久化到配置中。
8. 所有用户可配置项均应持久化，但写入各自正确的权威存储。
9. Skills、Extensions、Packages、MCP 等能力拥有独立、正确的前端管理页面。
10. 发布 NPM 包时不发布 TypeScript/React 业务源码，只发布编译后的生产运行产物。

---

## 2. 项目身份

项目统一使用以下名称：

```text
Folder:       pi-web-codex/
NPM package:  pi-web-codex
CLI command:  pi-web-codex
Config name:  pi-web-codex
Default port: 1816
Default host: 127.0.0.1
```

安装：

```bash
npm install -g pi-web-codex
```

启动：

```bash
pi-web-codex
```

启动后访问：

```text
http://127.0.0.1:1816
```

`pi-web-codex` 不是 Pi extension，也不是 Pi package。

它不应在 `package.json` 中声明：

```json
{
  "pi": {
    "extensions": []
  }
}
```

启动 Web UI 不要求执行：

```bash
pi install ...
```

---

## 3. 核心架构原则

### 3.1 Web Host 与 Agent Runtime 分离

`pi-web-codex` 的 Next.js Host 是唯一 Web Server。

Pi 和 Pi Client 只作为 Agent Runtime 存在，不承担：

- Web Server
- 静态文件服务
- 浏览器连接管理
- 端口分配
- 前端状态管理
- Session sidebar 管理

整体关系：

```text
Browser
   │
   │ HTTP + SSE
   ▼
pi-web-codex Next.js Host :1816
   │
   │ Node IPC
   ▼
Pi SDK Worker / Pi Client SDK Worker
```

### 3.2 单端口

无论用户：

- 创建多少个 session
- 同时打开多少个 session
- 同时运行多少个 worker
- 使用 Pi 或 Pi Client
- 同时让多个 session streaming

对外都只能监听：

```text
127.0.0.1:1816
```

Runtime worker 不监听 HTTP、WebSocket 或其他网络端口。

禁止使用旧架构中的：

```text
1816
1817
1818
1819
...
```

自动递增端口逻辑。

端口被占用时，应明确失败：

```text
Port 1816 is already in use.

Another pi-web-codex instance may already be running.
Open the existing instance or configure another port.
```

### 3.3 Session 是后端实体，不是前端内存状态

当前 session 必须由 URL 标识：

```text
/projects/:projectId/sessions/:sessionId
```

例如：

```text
/projects/p_01JX/sessions/s_01JY
```

禁止仅依赖：

```ts
let currentSession
let activeProject
let currentConversation
```

等浏览器全局变量表达页面身份。

刷新页面、复制 URL、打开新标签页后，必须仍然能进入同一个会话。

### 3.4 Session 固化 Runtime Binding

一个 session 创建时使用的是 Pi，后续永远默认由 Pi 恢复。

一个 session 创建时使用的是 Pi Client，后续永远默认由对应的 Pi Client profile 恢复。

修改全局 runtime 设置，只影响之后新建的 session。

禁止静默把已有 session 从 Pi 切换成 Pi Client，或反向切换。

---

## 4. 总体架构

```text
┌──────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│                                                              │
│ /projects/:projectId/sessions/:sessionId                     │
│ /settings/general                                            │
│ /settings/appearance                                         │
│ /settings/models                                             │
│ /settings/packages                                           │
│ /settings/extensions                                         │
│ /settings/skills                                             │
│ /settings/mcp                                                │
│ /settings/developer                                          │
└───────────────────────────┬──────────────────────────────────┘
                            │
                     REST + SSE
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ pi-web-codex Next.js Host · 127.0.0.1:1816                  │
│                                                              │
│  App Router / React UI                                       │
│  Route Handlers                                              │
│  ConfigService                                               │
│  SessionCatalog                                              │
│  RuntimeRegistry                                             │
│  RuntimeSupervisor                                           │
│  EventHub                                                    │
│  ResourceService                                             │
│  PackageService                                              │
│  McpService                                                  │
│  SecretStore                                                 │
└───────────────────────────┬──────────────────────────────────┘
                            │
                          Node IPC
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
┌──────────────────────────┐  ┌──────────────────────────────┐
│ Pi SDK Worker            │  │ Pi Client SDK Worker         │
│                          │  │                              │
│ runtimeKind = pi         │  │ runtimeKind = pi-client      │
│ local provider requests  │  │ pi-server transport          │
│ local session storage    │  │ server-backed session state  │
│ Pi extensions            │  │ Pi Client fork extensions    │
│ Pi skills                │  │ Pi Client fork skills        │
└──────────────────────────┘  └──────────────────────────────┘
```

---

## 5. Next.js 运行模式

## 5.1 不使用纯静态导出

不能使用：

```js
export default {
  output: "export",
}
```

纯静态导出只能生成浏览器静态文件，不能实现：

- 本地配置文件读写
- Pi SDK Worker 管理
- Node IPC
- Session JSONL 读取
- SSE
- Route Handlers 动态接口
- 本地文件浏览器
- Skills/Extensions 管理
- MCP 连接
- SecretStore
- Process lifecycle

因此，本文中的“只发布 Next.js 编译好的 static file”应解释为：

> NPM 包不发布 `.ts`、`.tsx` 等业务源代码，只发布 Next.js 编译产物、浏览器静态资源、编译后的 Worker 和最小 CLI launcher。

## 5.2 使用 standalone build

Next.js 配置：

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
}

export default nextConfig
```

生产发布包含：

```text
.next/standalone
.next/static
public
compiled workers
compiled CLI
```

## 5.3 不使用 custom Next.js server

为了保持 Next.js standalone 的标准运行方式，不额外实现自定义 HTTP Server。

浏览器到服务端使用：

```text
REST
```

服务端到浏览器实时推送使用：

```text
SSE
```

不在第一版中引入自定义 WebSocket upgrade server。

---

## 6. 前后端通信

## 6.1 通信模型

```text
Browser → Server:
REST POST / PUT / PATCH / DELETE

Server → Browser:
SSE event stream
```

适合 REST 的操作：

- 创建 session
- 发送消息
- abort
- compact
- 修改 model
- 修改 thinking level
- fork
- clone
- tree navigation
- settings 更新
- package install/remove/update
- skill toggle
- extension toggle
- MCP 配置
- Extension UI response

适合 SSE 的事件：

- assistant streaming
- thinking streaming
- tool execution
- tool result
- queue update
- compaction status
- retry status
- runtime status
- session metadata update
- extension dialog request
- notifications
- MCP status
- config update

---

## 6.2 API 基础路径

统一使用：

```text
/api/v1
```

不直接把 Pi RPC 或 Pi SDK 类型暴露给浏览器。

所有接口使用 `pi-web-codex` 自己的版本化 Domain Protocol。

---

## 6.3 REST API

### Bootstrap

```text
GET /api/v1/bootstrap
```

返回：

- application version
- current config
- runtime capabilities
- current projects
- recent sessions
- active runtimes
- feature flags

### Health

```text
GET /api/v1/health
```

示例：

```json
{
  "status": "ok",
  "version": "0.1.0",
  "host": "127.0.0.1",
  "port": 1816
}
```

### Projects

```text
GET  /api/v1/projects
POST /api/v1/projects

GET   /api/v1/projects/:projectId
PATCH /api/v1/projects/:projectId
```

### Sessions

```text
GET  /api/v1/projects/:projectId/sessions
POST /api/v1/sessions

GET    /api/v1/sessions/:sessionId
PATCH  /api/v1/sessions/:sessionId
DELETE /api/v1/sessions/:sessionId
```

### Runtime lifecycle

```text
POST   /api/v1/sessions/:sessionId/activate
DELETE /api/v1/sessions/:sessionId/runtime
POST   /api/v1/sessions/:sessionId/runtime/restart
```

### Messages

```text
POST /api/v1/sessions/:sessionId/messages
POST /api/v1/sessions/:sessionId/abort
```

发送消息：

```json
{
  "message": "Review this repository",
  "attachments": [],
  "streamingBehavior": "steer"
}
```

响应只代表消息已被接受：

```json
{
  "operationId": "op_01JXYZ",
  "accepted": true,
  "queued": false
}
```

### Entries 与 Tree

```text
GET  /api/v1/sessions/:sessionId/entries
GET  /api/v1/sessions/:sessionId/tree
POST /api/v1/sessions/:sessionId/tree/navigate
```

增量 entries：

```text
GET /api/v1/sessions/:sessionId/entries?afterEntryId=e_123
```

### Session operations

```text
POST /api/v1/sessions/:sessionId/fork
POST /api/v1/sessions/:sessionId/clone
POST /api/v1/sessions/:sessionId/compact
POST /api/v1/sessions/:sessionId/export
POST /api/v1/sessions/:sessionId/share
```

### Model 与 thinking

```text
GET /api/v1/sessions/:sessionId/models

PUT /api/v1/sessions/:sessionId/model
PUT /api/v1/sessions/:sessionId/thinking-level
PUT /api/v1/sessions/:sessionId/queue-settings
```

### Settings

```text
GET   /api/v1/settings
PATCH /api/v1/settings
```

### Runtime profiles

```text
GET  /api/v1/runtimes
POST /api/v1/runtimes/:profileId/test
```

### Packages

```text
GET    /api/v1/packages
POST   /api/v1/packages
PATCH  /api/v1/packages/:packageId
DELETE /api/v1/packages/:packageId

POST /api/v1/packages/:packageId/update
```

### Skills

```text
GET   /api/v1/skills
PATCH /api/v1/skills/:skillId
```

### Extensions

```text
GET   /api/v1/extensions
PATCH /api/v1/extensions/:extensionId
```

### MCP

```text
GET    /api/v1/mcp/servers
POST   /api/v1/mcp/servers
PATCH  /api/v1/mcp/servers/:serverId
DELETE /api/v1/mcp/servers/:serverId

POST /api/v1/mcp/servers/:serverId/test
POST /api/v1/mcp/servers/:serverId/reconnect
```

### Extension UI

```text
POST /api/v1/extension-ui/:requestId/respond
```

---

## 6.4 SSE

事件接口：

```text
GET /api/v1/events
```

客户端可通过 query 参数订阅：

```text
GET /api/v1/events?sessionId=s_123&sessionId=s_456
```

事件结构：

```ts
export interface WebEvent<T = unknown> {
  id: string
  seq: number
  type: string

  sessionId?: string
  operationId?: string

  timestamp: string
  payload: T
}
```

示例：

```json
{
  "id": "evt_01JXYZ",
  "seq": 182,
  "type": "assistant.text.delta",
  "sessionId": "s_123",
  "operationId": "op_456",
  "timestamp": "2026-07-13T10:30:00.000Z",
  "payload": {
    "messageId": "m_789",
    "contentIndex": 0,
    "delta": "Hello"
  }
}
```

主要事件类型：

```text
runtime.starting
runtime.ready
runtime.busy
runtime.idle
runtime.crashed
runtime.stopped

session.snapshot
session.entry.appended
session.name.changed
session.leaf.changed

assistant.message.start
assistant.text.delta
assistant.thinking.delta
assistant.message.end

tool.execution.start
tool.execution.update
tool.execution.end

queue.updated

compaction.start
compaction.end

retry.start
retry.end

extension.ui.request
extension.notification
extension.status.updated
extension.widget.updated

mcp.server.status
mcp.tools.updated

config.updated

resync.required
```

---

## 6.5 断线恢复

客户端保存最后收到的：

```text
Last-Event-ID
```

重新连接时通过标准 SSE header 恢复。

服务端保留有限事件 ring buffer。

```text
Last-Event-ID 仍在 ring buffer
    → 重放遗漏事件

Last-Event-ID 已过期
    → 推送 resync.required
    → 客户端重新获取 session snapshot
```

持久 Session entry 使用 Pi entry ID 作为 durable cursor。

SSE sequence 只用于短期 realtime replay，不取代 session JSONL。

---

## 7. Pi 与 Pi Client Runtime

## 7.1 Runtime 类型

```ts
export type RuntimeKind = "pi" | "pi-client"
```

默认值：

```ts
const DEFAULT_RUNTIME_KIND: RuntimeKind = "pi"
```

## 7.2 设置入口

```text
Settings
└── Developer
    └── Agent Runtime
        ├── Pi
        └── Pi Client
```

Pi 为默认选项。

## 7.3 配置示例

```json
{
  "developer": {
    "runtime": {
      "default": "pi",
      "profiles": {
        "pi": {
          "kind": "pi",
          "enabled": true
        },
        "pi-client-default": {
          "kind": "pi-client",
          "enabled": false,
          "serverUrl": "",
          "authTokenRef": null
        }
      }
    }
  }
}
```

## 7.4 Runtime 决策优先级

严格使用：

```text
1. 已有 session 的 runtime binding
2. 创建 session 时的显式 runtime
3. Project 默认 runtime
4. Settings / Developer 中的全局默认 runtime
5. 内置默认 Pi
```

禁止根据以下条件选择：

- PATH 顺序
- 哪个 binary 最近安装
- 当前有哪些 `pi` 或 `pi-client` 进程
- `PI_SERVER_URL` 是否存在
- 哪个程序最近运行
- 哪个端口处于监听状态

## 7.5 Existing session 不受默认值修改影响

假设：

```text
Session A 创建时使用 Pi
Session B 创建时使用 Pi Client
```

用户随后把默认 runtime 从 Pi 改为 Pi Client。

结果：

```text
Session A resume → Pi
Session B resume → Pi Client
New Session C   → Pi Client
```

不允许：

```text
Session A resume → Pi Client
```

除非用户执行显式迁移。

## 7.6 Runtime 迁移

提供：

```text
Duplicate into selected runtime
```

该操作：

1. 读取原 session 当前 branch/context。
2. 创建一个新的 session。
3. 新 session 绑定目标 runtime。
4. 原 session 保持不变。
5. 新旧 session 建立 migration reference。

禁止原地篡改 runtime binding。

---

## 8. Session 数据模型

## 8.1 Web Session ID

浏览器使用 `pi-web-codex` 自己生成的 session ID。

```ts
export interface WebSessionRecord {
  id: string
  projectId: string

  runtime: SessionRuntimeBinding

  nativeSessionId: string
  nativeSessionFile?: string

  title?: string
  createdAt: string
  updatedAt: string

  runtimeStatus: "stopped" | "starting" | "ready" | "busy" | "crashed"
}
```

Runtime binding：

```ts
export interface SessionRuntimeBinding {
  kind: "pi" | "pi-client"
  profileId: string

  distributionName: string
  distributionVersion?: string

  backendFingerprint?: string
}
```

## 8.2 Native Session Identity

```text
Web session ID
    ↓
Runtime profile
    ↓
Native session ID / session file
```

不能仅使用 native session ID 作为全局主键。

以下两个 session 可能完全不同：

```text
pi:abc123
pi-client-prod:abc123
```

## 8.3 Pi JSONL 是权威数据

对于 Pi 本地 session：

```text
Pi JSONL = conversation source of truth
```

`pi-web-codex` 不直接写 message entries。

以下操作应通过 runtime 完成：

- prompt
- model change
- thinking change
- compact
- tree navigation
- fork
- clone
- rename
- extension custom entry

应用数据库只保存：

- Web session identity
- runtime binding
- project relationship
- favorites
- tags
- sidebar state
- search index
- UI metadata

---

## 9. Runtime Worker

## 9.1 为什么使用 Worker

Pi extensions 拥有本地用户权限，可以：

- 执行任意代码
- 创建 timers
- 修改全局状态
- 阻塞 event loop
- 抛出异常
- 调用 `process.exit`
- 加载 native dependencies
- 造成内存泄漏

因此 Pi SDK 不能直接与 Next.js Host 运行在同一 Node.js 进程。

否则：

```text
一个 extension 崩溃
    → Next.js Host 崩溃
    → 所有 session 断开
    → Settings 和历史页面也不可用
```

## 9.2 Worker 类型

```text
dist/workers/pi/dist/worker.mjs
dist/workers/pi-client/dist/worker.mjs
```

每个 active session 默认对应一个 worker。

历史 session 默认不启动 worker。

只有发生以下情况时才激活：

- 发送 prompt
- 修改 model
- 修改 thinking level
- compact
- tree navigation
- fork
- clone
- 执行 runtime command

## 9.3 Worker 不监听端口

Worker 只能通过 Node IPC 与 Host 通信。

```ts
import { fork } from "node:child_process"

const child = fork(workerEntrypoint, [], {
  cwd: projectPath,
  env: runtimeEnvironment,
  stdio: ["ignore", "pipe", "pipe", "ipc"],
})
```

stdout/stderr 用于日志。

禁止使用 stdout JSONL 作为内部通信协议，避免 extension 的 `console.log()` 污染协议。

## 9.4 IPC Protocol

Host 到 Worker：

```ts
export type HostToWorkerMessage =
  | {
      type: "runtime.initialize"
      requestId: string
      payload: RuntimeInitializeInput
    }
  | {
      type: "session.prompt"
      requestId: string
      sessionId: string
      payload: PromptInput
    }
  | {
      type: "session.abort"
      requestId: string
      sessionId: string
    }
  | {
      type: "session.set-model"
      requestId: string
      sessionId: string
      payload: ModelRef
    }
  | {
      type: "session.set-thinking-level"
      requestId: string
      sessionId: string
      payload: {
        level: ThinkingLevel
      }
    }
  | {
      type: "session.compact"
      requestId: string
      sessionId: string
      payload: {
        instructions?: string
      }
    }
  | {
      type: "session.navigate-tree"
      requestId: string
      sessionId: string
      payload: {
        entryId: string
        summarize?: boolean
      }
    }
  | {
      type: "extension-ui.response"
      requestId: string
      sessionId: string
      payload: ExtensionUiResponse
    }
  | {
      type: "runtime.shutdown"
      requestId: string
    }
```

Worker 到 Host：

```ts
export type WorkerToHostMessage =
  | {
      type: "runtime.ready"
      requestId: string
      payload: {
        capabilities: RuntimeCapabilities
        session: RuntimeSessionSnapshot
      }
    }
  | {
      type: "runtime.response"
      requestId: string
      success: boolean
      data?: unknown
      error?: RuntimeError
    }
  | {
      type: "session.event"
      sessionId: string
      seq: number
      payload: RuntimeDomainEvent
    }
  | {
      type: "extension-ui.request"
      sessionId: string
      payload: ExtensionUiRequest
    }
  | {
      type: "runtime.log"
      sessionId?: string
      payload: RuntimeLogEntry
    }
  | {
      type: "runtime.fatal"
      payload: RuntimeError
    }
```

## 9.5 RuntimeSupervisor

```ts
export interface ManagedRuntime {
  webSessionId: string
  runtimeKind: RuntimeKind
  profileId: string

  nativeSessionId: string
  nativeSessionFile?: string
  cwd: string

  process: ChildProcess
  status: "starting" | "ready" | "busy" | "stopping" | "crashed"

  startedAt: number
  lastActivityAt: number

  subscriberCount: number
  restartCount: number

  pendingReload: boolean
}
```

RuntimeSupervisor 负责：

- worker 启动
- worker 关闭
- worker 重启
- request/response correlation
- session write lease
- timeout
- crash detection
- restart backoff
- stdout/stderr capture
- idle runtime 回收
- graceful shutdown
- configuration reload

## 9.6 Session 写锁

同一个 native session 只能由一个 writable worker 打开。

锁 identity：

```text
runtime profile ID + native session identity
```

锁文件：

```text
<config-dir>/locks/sessions/<hash>.lock
```

锁内容：

```json
{
  "ownerPid": 12345,
  "webSessionId": "s_123",
  "runtimeProfileId": "pi",
  "createdAt": "2026-07-13T10:00:00.000Z"
}
```

防止：

- 两个标签页创建两个 worker
- 两个 `pi-web-codex` 实例同时写一个 session
- Pi 和 Pi Client 意外写同一份 session 数据
- crash 后留下无法识别的 writer

---

## 10. Pi SDK Worker

Pi worker 使用 Pi SDK：

```ts
createAgentSessionRuntime()
```

或等价的 runtime factory。

Worker 应使用 Pi 自己的：

- AuthStorage
- ModelRegistry
- SettingsManager
- SessionManager
- DefaultResourceLoader
- AgentSession
- AgentSessionRuntime

不应重新实现 Pi 的：

- extension discovery
- skill discovery
- prompt discovery
- AGENTS.md discovery
- model restoration
- session tree
- compaction
- retry
- queue behavior

Worker 初始化逻辑概念上为：

```ts
const runtime = await createPiRuntime({
  cwd,
  sessionTarget,
  agentDir,
})

bindRuntimeEvents(runtime)
bindExtensionUi(runtime)
sendRuntimeReady(runtime)
```

Session replacement 后必须：

1. 解绑旧 session events。
2. 完成旧 extension `session_shutdown`。
3. 创建新 runtime。
4. 重新绑定 extension UI。
5. 重新订阅新 session events。
6. 向 Host 发送新的 snapshot。

---

## 11. Pi Client SDK Worker

Pi Client 不能被视为一个等待 Web UI 连接的 daemon。

Pi Client runtime 是一套不同的 Pi distribution，通常通过：

```text
PI_SERVER_MODE=true
PI_SERVER_URL=...
PI_SERVER_AUTH_TOKEN=...
```

连接 Pi Server。

Pi Client Worker 使用隔离的依赖根，避免与 upstream Pi SDK 发生模块解析冲突。

推荐目录：

```text
packages/
├── worker-pi/
│   ├── package.json
│   └── src/worker.ts
│
└── worker-pi-client/
    ├── package.json
    └── src/worker.ts
```

Pi worker：

```json
{
  "dependencies": {
    "@earendil-works/pi-coding-agent": "<supported-version>"
  }
}
```

Pi Client worker：

```json
{
  "dependencies": {
    "@earendil-works/pi-coding-agent": "npm:@averyyy/pi-coding-agent@<supported-version>"
  }
}
```

Pi Client Worker 环境：

```ts
{
  ...sanitizedEnv,
  PI_SERVER_MODE: "true",
  PI_SERVER_URL: profile.serverUrl,
  PI_SERVER_AUTH_TOKEN: resolvedAuthToken
}
```

Pi Worker 环境必须显式移除：

```text
PI_SERVER_MODE
PI_SERVER_URL
PI_SERVER_AUTH_TOKEN
```

防止用户 Shell 中残留的环境变量让 Pi runtime 意外进入 Pi Client 模式。

---

## 12. Extension 支持

## 12.1 Extension 继续由 Pi Runtime 加载

`pi-web-codex` 不删除用户已有的 Pi extension 生态。

Pi Worker 仍然加载：

- global extensions
- project extensions
- package extensions
- explicit extension paths

Pi Client Worker 加载 Pi Client distribution 对应的 extension runtime。

## 12.2 Standard Extension UI

实现自定义 Web Extension UI Context。

映射关系：

| Pi Extension UI   | Web UI                  |
| ----------------- | ----------------------- |
| `select()`        | Select Dialog           |
| `confirm()`       | Alert Dialog            |
| `input()`         | Input Dialog            |
| `editor()`        | Multiline Editor Dialog |
| `notify()`        | Toast                   |
| `setStatus()`     | Session status area     |
| `setWidget()`     | Composer widget slot    |
| `setTitle()`      | Browser title           |
| `setEditorText()` | Session composer draft  |

所有 Extension UI 请求必须携带：

```text
sessionId
requestId
extension identity
```

禁止使用全局单一 dialog state。

两个 session 同时请求 confirm 时，应分别显示或按 session 排队，不能覆盖。

## 12.3 TUI-only Extension 功能

不能承诺自动把任意 TUI component 转换成 React。

例如：

- `ctx.ui.custom()`
- custom footer
- custom header
- custom editor component
- raw terminal input listener
- TUI tool renderer
- TUI theme component

这些需要 `pi-web-codex` Web Contribution API。

示例：

```ts
export interface WebContributionManifest {
  extensionId: string

  toolRenderers?: WebToolRendererContribution[]
  settingsPages?: WebSettingsContribution[]
  panels?: WebPanelContribution[]
  commands?: WebCommandContribution[]
}
```

第一版优先支持 declarative schema。

不允许第三方 extension 直接向主 Next.js 应用注入任意 React 代码。

需要复杂 UI 时使用：

```text
sandboxed iframe
```

并配置严格 CSP。

---

## 13. Skills、Extensions 与 Packages

## 13.1 页面结构

```text
Settings
├── Packages
├── Extensions
└── Skills
```

每个页面支持 scope：

```text
Global
Current Project
```

## 13.2 Resource 数据模型

```ts
export interface ResourceView {
  id: string
  type: "extension" | "skill" | "prompt" | "theme"

  name: string
  description?: string

  scope: "global" | "project"
  projectId?: string

  source: "package" | "directory" | "explicit-path" | "builtin"

  sourcePath?: string
  packageSource?: string

  enabled: boolean
  inherited: boolean
  overridden: boolean
  missing: boolean

  reloadRequired: boolean
}
```

## 13.3 Toggle 语义

前端 toggle 不得只修改 UI state。

正确流程：

```text
User toggles resource
    ↓
ResourceService validates scope
    ↓
Pi SettingsManager / PackageManager mutation
    ↓
Atomic persistence
    ↓
Affected runtimes marked pendingReload
    ↓
Idle runtime reloads immediately
Busy runtime reloads after agent_settled
    ↓
Frontend receives updated capability snapshot
```

## 13.4 Project trust

项目级：

- extensions
- packages
- skills
- MCP
- project settings

必须遵循 project trust。

未受信任项目中，前端应显示：

```text
This project is not trusted.

Project-local extensions, packages and executable integrations
will not be loaded until the project is trusted.
```

不能因为 Web Host 可以读取目录，就绕过 Pi 的信任机制。

---

## 14. MCP

## 14.1 MCP 页面

```text
Settings
└── MCP
    ├── Global servers
    └── Project servers
```

显示：

- enabled
- scope
- transport
- connection status
- discovered tools
- enabled tools
- last connected
- last error
- reconnect
- test connection
- logs

## 14.2 MCP 配置

```ts
export interface McpServerConfig {
  id: string
  name: string

  scope: "global" | "project"
  projectId?: string

  enabled: boolean

  transport:
    | {
        type: "stdio"
        command: string
        args: string[]
        cwd?: string
      }
    | {
        type: "http"
        url: string
        headers?: Record<string, string | SecretReference>
      }

  env: Record<string, string | SecretReference>

  timeoutMs?: number

  enabledTools?: string[]
  disabledTools?: string[]
}
```

## 14.3 MCP 与 SDK

SDK Worker 可以把 MCP tools 注入为 custom tools。

概念流程：

```text
MCP config
    ↓
Host McpService keeps one client per server
    ↓
Tool discovery and enabled-tool filtering
    ↓
Definitions sent to the selected Worker at initialization
    ↓
Worker registers proxy Pi ToolDefinitions in AgentSession
    ↓
Tool execute request returns to the shared Host client over IPC
    ↓
MCP call result returns to Pi and the frontend event stream
```

MCP tool 名称应 namespace 化：

```text
mcp__github__search_issues
mcp__postgres__query
mcp__browser__navigate
```

## 14.4 Secrets

MCP token、API key 等不得明文存入 `config.json`。

配置保存引用：

```json
{
  "GITHUB_TOKEN": {
    "$secret": "2f02c04d-dcf1-4cb0-a5c8-901801d649f1"
  }
}
```

真实 secret 由 SecretStore 管理。

GET API 不返回 secret 明文，只返回：

```json
{
  "configured": true
}
```

---

## 15. 配置持久化

## 15.1 配置目录

支持环境变量：

```text
PI_WEB_CODEX_CONFIG_DIR
```

默认位置：

```text
Linux:
$XDG_CONFIG_HOME/pi-web-codex
或 ~/.config/pi-web-codex

macOS:
~/Library/Application Support/pi-web-codex

Windows:
%APPDATA%\pi-web-codex
```

目录：

```text
pi-web-codex/
├── config.json
├── state.db
├── secrets/
├── cache/
├── logs/
└── locks/
```

## 15.2 config.json

示例：

```json
{
  "schemaVersion": 2,
  "revision": 12,

  "server": {
    "host": "127.0.0.1",
    "port": 1816,
    "openBrowser": true
  },

  "appearance": {
    "theme": "system",
    "density": "comfortable",
    "fontSize": 14,
    "sidebarWidth": 296
  },

  "chat": {
    "defaultQueueMode": "steer",
    "autoScroll": true,
    "collapseThinking": true,
    "collapseToolOutput": false
  },

  "developer": {
    "runtime": {
      "default": "pi",

      "profiles": {
        "pi": {
          "kind": "pi",
          "enabled": true
        },

        "pi-client-default": {
          "kind": "pi-client",
          "enabled": false,
          "serverUrl": "",
          "authTokenRef": null
        }
      }
    },

    "logLevel": "info",
    "showProtocolInspector": false
  }
}
```

## 15.3 设置的权威存储

“所有设置都记忆”不等于所有东西都塞进一个 JSON。

| 设置                            | 权威存储                        |
| ------------------------------- | ------------------------------- |
| host、port、open browser        | `config.json`                   |
| appearance、density、font size  | `config.json`                   |
| 默认 runtime                    | `config.json`                   |
| Pi Client profiles              | `config.json`                   |
| 收藏、标签、project 排序        | `state.db`                      |
| composer drafts                 | `state.db`                      |
| 最近打开 session                | `state.db`                      |
| Pi models/settings              | Pi settings                     |
| Pi packages                     | Pi settings/package manager     |
| Pi skills/extensions filters    | Pi settings                     |
| project-local resource override | project settings                |
| MCP config                      | `config.json` 或 project config |
| API key、token、MCP secret      | SecretStore                     |

Settings UI 对用户呈现为统一系统，但服务端根据 setting key 路由到正确存储。

## 15.4 配置写入

必须支持：

- Zod schema validation
- schema version
- migration
- revision
- ETag / optimistic concurrency
- temporary file
- fsync
- atomic rename

PATCH 示例：

```http
PATCH /api/v1/settings
If-Match: "revision-12"
```

```json
{
  "developer": {
    "runtime": {
      "default": "pi-client-default"
    }
  }
}
```

旧 revision 写入应返回：

```http
409 Conflict
```

禁止多标签页静默覆盖新配置。

---

## 16. 应用数据库

推荐 SQLite。

用途：

- project catalog
- session catalog
- runtime binding
- favorites
- tags
- sidebar state
- drafts
- search index
- recently opened
- file indexing metadata

示例表：

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE,
  display_name TEXT,
  default_runtime_profile_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,

  runtime_kind TEXT NOT NULL,
  runtime_profile_id TEXT NOT NULL,

  native_session_id TEXT NOT NULL,
  native_session_file TEXT,

  title TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE session_ui_state (
  session_id TEXT PRIMARY KEY,
  draft TEXT,
  scroll_anchor TEXT,
  last_opened_at TEXT,
  FOREIGN KEY(session_id) REFERENCES sessions(id)
);

CREATE TABLE session_tags (
  session_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(session_id, tag)
);
```

全文搜索使用 SQLite FTS。

Pi JSONL 仍然是 conversation authority，FTS 只是派生索引。

---

## 17. 历史 Session 索引

Indexer 根据 session 文件：

- mtime
- size
- last byte offset
- last entry ID

进行增量更新。

```text
mtime/size 未变化
    → 跳过

文件 append
    → 从上次 byte offset 继续读取

文件缩短或重写
    → 重建该 session 索引
```

历史 session 浏览不启动 worker。

只有用户对历史 session 发起 mutation 时才 activate runtime。

---

## 18. 前端结构

## 18.1 路由

```text
app/
├── layout.tsx
├── page.tsx
│
├── projects/
│   └── [projectId]/
│       └── sessions/
│           └── [sessionId]/
│               └── page.tsx
│
├── settings/
│   ├── layout.tsx
│   ├── general/page.tsx
│   ├── appearance/page.tsx
│   ├── chat/page.tsx
│   ├── models/page.tsx
│   ├── packages/page.tsx
│   ├── extensions/page.tsx
│   ├── skills/page.tsx
│   ├── mcp/page.tsx
│   └── developer/page.tsx
│
└── api/
    └── v1/
        ├── bootstrap/route.ts
        ├── health/route.ts
        ├── events/route.ts
        ├── settings/route.ts
        ├── projects/...
        ├── sessions/...
        ├── packages/...
        ├── skills/...
        ├── extensions/...
        └── mcp/...
```

## 18.2 前端状态分层

### URL

负责：

- current project
- current session
- settings section

### TanStack Query

负责：

- project metadata
- session metadata
- session snapshot
- server settings
- resources
- runtime state query
- MCP status

### React local state / 小型 Zustand

只负责：

- composer draft editing state
- temporary popover
- selected message
- local panel visibility
- pending attachment preview
- optimistic UI markers

禁止 Zustand 保存：

- 完整 session messages
- 当前 session identity
- 服务端 settings authority
- runtime worker truth
- canonical model state

### SSE Event Reducer

SSE event 更新 TanStack Query cache 或 session event store。

必须按 `sessionId` 隔离。

---

## 19. 页面信息架构

## 19.1 左侧栏

```text
New session
Search

Favourites

Projects
├── Project A
│   ├── Session 1
│   └── Session 2
└── Project B

Archived

Settings
```

## 19.2 Session 顶栏

```text
Session title
Project
Git branch
Runtime badge
Runtime status

Tree
Fork
Clone
Export
Share
More
```

Runtime badge 只显示当前 session 绑定：

```text
Pi
```

或：

```text
Pi Client · Production
```

默认不允许从 session 顶栏直接改变 runtime。

## 19.3 Message 区域

支持：

- user messages
- assistant messages
- thinking blocks
- tool calls
- partial tool results
- final tool results
- extension custom messages
- compaction marker
- branch marker
- errors
- retry state

## 19.4 Composer

支持：

- textarea
- attachments
- file mention
- skill command
- prompt template
- send
- steer
- follow-up
- abort
- model picker
- thinking level
- context usage
- queue indicator

## 19.5 Settings

```text
General
Appearance
Chat & Composer
Models & Providers
Packages
Extensions
Skills
MCP
Developer
```

Developer：

```text
Agent Runtime
├── Pi
└── Pi Client

Runtime diagnostics
Logs
Protocol inspector
Config path
Data path
Reset cache
```

---

## 20. Tool Rendering

通用 renderer：

```text
unknown tool
    → generic JSON call/result card
```

内置 renderer：

```text
read
write
edit
bash
grep
find
ls
```

支持：

- syntax highlight
- inline diff
- terminal output
- partial streaming replacement
- collapsed/expanded state
- error state
- full output path
- copy
- open file

工具渲染根据 Domain Protocol，而不是直接依赖 Pi SDK internal object reference。

---

## 21. Security

默认只绑定：

```text
127.0.0.1
```

不能默认绑定：

```text
0.0.0.0
```

启用 LAN 时必须显式配置认证。

必须实现：

- Host validation
- Origin validation
- CSRF protection
- mutation token
- request body size limit
- attachment size limit
- path normalization
- symlink escape prevention
- project-root sandbox
- session write lease
- package mutation serialization
- secret redaction
- log redaction
- child process group cleanup

文件接口只允许访问：

```text
current project root
explicitly approved external roots
pi-web-codex data directory
```

禁止客户端直接提交任意绝对路径并读取。

---

## 22. CLI

入口命令：

```bash
pi-web-codex
```

执行流程：

```text
Load config
    ↓
Acquire single-instance lock
    ↓
Check existing health endpoint
    ↓
Start Next.js standalone server
    ↓
Wait for /api/v1/health
    ↓
Open browser
    ↓
Handle SIGINT/SIGTERM
    ↓
Gracefully stop workers
    ↓
Release locks
```

参数：

```text
--host
--port
--open
--no-open
--config-dir
--log-level
--version
--help
```

子命令：

```bash
pi-web-codex doctor
pi-web-codex config path
pi-web-codex data path
pi-web-codex reset-cache
pi-web-codex logs
```

再次执行命令时：

```text
existing valid instance found
    → open existing URL
    → exit successfully
```

不能启动第二个 Host。

---

## 23. 项目目录

```text
pi-web-codex/
├── apps/
│   └── web/
│       ├── app/
│       ├── public/
│       ├── src/
│       │   ├── client/
│       │   └── server/
│       ├── next.config.ts
│       └── package.json
│
├── packages/
│   ├── protocol/
│   │   ├── src/api.ts
│   │   ├── src/events.ts
│   │   ├── src/ipc.ts
│   │   └── src/schemas.ts
│   │
│   ├── runtime-supervisor/
│   │   ├── src/supervisor.ts
│   │   ├── src/runtime-handle.ts
│   │   ├── src/session-lock.ts
│   │   └── src/process-control.ts
│   │
│   ├── worker-pi/
│   │   ├── src/worker.ts
│   │   ├── src/runtime.ts
│   │   └── package.json
│   │
│   ├── worker-pi-client/
│   │   ├── src/worker.ts
│   │   ├── src/runtime.ts
│   │   └── package.json
│   │
│   ├── config/
│   │   ├── src/config-service.ts
│   │   ├── src/schema.ts
│   │   ├── src/migrations.ts
│   │   └── src/secret-store.ts
│   │
│   ├── session-store/
│   │   ├── src/catalog.ts
│   │   ├── src/jsonl-reader.ts
│   │   ├── src/indexer.ts
│   │   └── src/search.ts
│   │
│   ├── resources/
│   │   ├── src/package-service.ts
│   │   ├── src/skill-service.ts
│   │   └── src/extension-service.ts
│   │
│   ├── mcp/
│   │   ├── src/config.ts
│   │   ├── src/client-manager.ts
│   │   ├── src/tool-adapter.ts
│   │   └── src/status.ts
│   │
│   └── ui/
│       ├── src/chat/
│       ├── src/composer/
│       ├── src/tools/
│       ├── src/settings/
│       └── src/dialogs/
│
├── bin/
│   └── pi-web-codex.mjs
│
├── scripts/
│   ├── build-workers.mjs
│   ├── assemble-dist.mjs
│   └── verify-package.mjs
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── README.md
└── LICENSE
```

---

## 24. 发布

## 24.1 构建流程

```text
1. Build shared packages
2. Build Pi worker
3. Build Pi Client worker
4. Run next build
5. Assemble standalone distribution
6. Copy .next/static
7. Copy public
8. Copy compiled workers
9. Copy compiled CLI
10. Verify package contents
11. Smoke test
12. npm pack
```

## 24.2 发布内容

```text
pi-web-codex-x.y.z.tgz
├── package.json
├── bin/
│   └── pi-web-codex.mjs
│
├── dist/
│   ├── app/
│   │   ├── server.js
│   │   ├── .next/
│   │   └── public/
│   │
│   └── workers/
│       ├── pi-worker.mjs
│       └── pi-client-worker.mjs
│
├── README.md
└── LICENSE
```

## 24.3 不发布

```text
app source
src source
tests
scripts source
*.ts
*.tsx
.next/cache
coverage
development source maps
legacy Tau code
```

## 24.4 NPM package files

```json
{
  "name": "pi-web-codex",
  "bin": {
    "pi-web-codex": "./bin/pi-web-codex.mjs"
  },
  "files": ["bin", "dist", "README.md", "LICENSE"]
}
```

---

## 25. 开发阶段

UI 随功能阶段逐步开放。只有已经接通真实数据、真实状态或真实操作的能力才进入界面；后续阶段的按钮、状态、计数和设置入口不提前做占位 UI。

## Phase 1：Application shell

- 新 repository/folder
- Next.js App Router
- standalone build
- CLI
- single-instance lock
- fixed port 1816
- settings persistence
- functional General and Appearance settings

## Phase 2：Read-only session browser

- Project catalog
- Pi JSONL reader
- Session list
- URL routing
- message renderer
- tool renderer
- SQLite index
- search

## Phase 3：Pi SDK Worker

- Worker IPC
- RuntimeSupervisor
- prompt
- streaming
- tool events
- abort
- model
- thinking
- queue
- compaction
- retry

## Phase 4：Session operations

- new session
- resume
- rename
- fork
- clone
- tree
- export
- import
- stats

## Phase 5：Extension UI

- confirm
- select
- input
- editor
- notify
- status
- widget
- editor draft update

## Phase 6：Packages、Skills、Extensions

- resolved resources
- global/project scope
- enable/disable
- install/remove/update
- trust
- safe reload

## Phase 7：Pi Client Worker

- independent dependency root
- Developer runtime selector
- server profiles
- authentication
- server session binding
- diagnostics
- runtime migration UI

## Phase 8：MCP

- MCP server configuration
- SecretStore
- stdio/http transports
- tool discovery
- per-tool enable/disable
- runtime injection
- reconnect/status/logs

## Phase 9：Polish

- installable PWA；Service Worker 只缓存带内容指纹的静态产物和图标，不缓存动态 session/API 响应
- Host realpath 边界内的只读 file browser，支持目录、文本预览和原文件下载
- 通过真实 `git` 子进程读取 branch、commit、upstream ahead/behind、index/worktree status
- desktop 与 mobile 响应式布局
- 浏览器本地保存的可选 notifications，只在页面隐藏且 Agent 完成、Runtime 崩溃或 extension notify 时触发
- 最近 100 条真实 Domain Protocol event inspector
- managed Worker、IPC、MCP 和 tool runtime diagnostics
- 显式 crash recovery；保留 JSONL 历史，不自动重放 prompt，不进入自动重启循环

---

## 26. 验收标准

### Server

1. `pi-web-codex` 默认监听 `127.0.0.1:1816`。
2. 创建二十个 session 后没有新的 HTTP 端口。
3. 端口冲突时不自动递增。
4. 再次执行命令会打开已有实例。
5. Host 崩溃或退出时能清理所有 managed workers。

### Routing

6. Session URL 为：

```text
/projects/:projectId/sessions/:sessionId
```

7. 刷新页面后仍打开同一个 session。
8. 复制 URL 到新标签页后仍能恢复 session。
9. Session identity 不依赖浏览器全局 state。

### Runtime

10. 默认 runtime 是 Pi。
11. Settings → Developer 可切换默认 runtime。
12. Runtime 设置会持久化。
13. 修改默认 runtime 只影响新 session。
14. Existing session 始终按原 runtime binding 恢复。
15. Pi 和 Pi Client 不根据 PATH 或运行进程自动猜测。

### Session

16. 历史 session 默认不启动 worker。
17. 首次 mutation 时懒激活 worker。
18. 同一个 native session 不能有两个 writable workers。
19. Worker crash 不影响 Next.js Host。
20. Worker crash 后历史内容仍可浏览。
21. Worker restart 不重复提交上一个 prompt。

### Streaming

22. 多个 session 可同时 streaming。
23. 不同 session 的消息、工具、dialog 不互相覆盖。
24. SSE 断线后可以重放遗漏事件。
25. 事件过期后可以执行完整 resync。

### Extensions

26. Extension confirm/select/input/editor 能完整 round-trip。
27. Extension UI request 必须绑定 session。
28. Extensions 的 tool call/result event 正常显示。
29. TUI-only component 不被错误宣称为自动兼容。
30. 不支持的 extension UI 有明确 capability 标识。

### Resources

31. Skills 页面能区分 global/project。
32. Extensions 页面能区分 global/project。
33. Package install/remove/update 使用真实 Pi package manager。
34. Toggle 后 runtime 中实际加载状态与 UI 一致。
35. 未信任项目不能加载项目级可执行资源。

### MCP

36. MCP toggle 不只是前端 state。
37. 启用 MCP 后对应 tools 实际进入 AgentSession。
38. 单个 MCP tool 可以启用或禁用。
39. Secrets 不通过 API 明文返回。
40. MCP 连接错误可在前端查看和重试。

### Release

41. NPM tarball 不包含 `.ts`、`.tsx` 业务源代码。
42. NPM tarball 包含 Next.js standalone 运行产物。
43. NPM tarball 包含 Pi 和 Pi Client compiled workers。
44. 全局安装后可直接执行：

```bash
pi-web-codex
```

以上 release 条件由一条命令完整验证：

```bash
pnpm release:verify
```

该命令构建 portable standalone 目录、检查 pack 内容、临时全局安装 tarball，并以安装后的 CLI 启动 Host 通过健康检查。

---

## 27. Architecture Decision Records

### ADR-001：全新项目身份

项目、NPM package 和 CLI 命令统一命名为：

```text
pi-web-codex
```

不继续使用 Tau 名称和旧目录。

### ADR-002：独立应用

`pi-web-codex` 是独立本地 Next.js 应用，不是 Pi extension。

### ADR-003：单 Web Host

Next.js Host 是唯一网络入口，默认监听：

```text
127.0.0.1:1816
```

### ADR-004：Standalone 发布

生产版本使用 Next.js standalone build。

“只发布静态文件”定义为只发布编译产物，而不是纯 static export。

### ADR-005：REST + SSE

浏览器到服务端使用 REST，服务端到浏览器使用 SSE。

第一版不使用自定义 WebSocket Server。

### ADR-006：SDK Worker

Pi 和 Pi Client 使用独立 SDK Worker。

Worker 不监听端口，通过 Node IPC 与 Host 通信。

### ADR-007：默认 Pi

默认 runtime 为 Pi。

### ADR-008：显式 Runtime 设置

Pi/Pi Client runtime 只能通过 Settings → Developer 显式配置和持久化。

不根据 PATH、环境变量或当前运行进程自动选择。

### ADR-009：Session Runtime Binding

每个 session 固化创建时的 runtime binding。

修改全局默认只影响新 session。

### ADR-010：Domain Protocol

Pi SDK 类型不直接暴露给浏览器。

所有数据必须转换成版本化的 `pi-web-codex` Domain Protocol。

### ADR-011：Pi JSONL Authority

Pi JSONL 是 Pi session conversation 的权威数据。

SQLite 只用于应用 metadata 和派生搜索索引。

### ADR-012：统一 Settings UI，分离权威存储

所有用户设置在前端统一管理和持久化，但后端根据设置类型写入：

- `config.json`
- SQLite
- Pi settings
- project settings
- SecretStore

### ADR-013：Extension Compatibility

标准 Extension UI 通过 Web UI Context 支持。

任意 TUI component 不自动转换为 React，复杂 UI 使用显式 Web Contribution API。

### ADR-014：固定端口失败策略

端口冲突时明确失败，不自动选择下一个端口。

---

## 28. 最终结论

`pi-web-codex` 应被设计为一个独立的本地 Agent 控制平面：

```text
Next.js Host
    = 产品 UI、配置、Session catalog、Runtime supervisor

Pi / Pi Client SDK Worker
    = Agent、Extension、Skill、Tool、Session runtime

Browser
    = 路由化、可恢复、服务端驱动的用户界面
```

最终边界为：

```text
Browser
    ↕ REST + SSE

pi-web-codex :1816
    ↕ Node IPC

Pi SDK Worker / Pi Client SDK Worker
```

这样可以同时实现：

- 单端口
- 正确路由
- 多 session 并发
- Runtime 隔离
- 完整 Pi 功能
- Pi/Pi Client 可选择
- 设置持久化
- Skills/Extensions/MCP 管理
- 编译产物发布
- 不再重复旧 Tau 项目的状态和生命周期错误

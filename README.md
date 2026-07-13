# pi-web-codex

A local, single-port Web Host for Pi coding-agent workflows.

The current milestone provides the production host lifecycle, health and settings
APIs, atomic local configuration, functional General and Appearance pages, a
browser for real Pi JSONL projects, sessions, messages, tool records, and
full-text search, plus an isolated Pi SDK worker. Session pages lazily activate
their worker and expose real prompt streaming, tool events, abort, model,
thinking, queue, compaction, and retry state. Pi-backed session operations cover
new, resume, rename, fork, clone, tree navigation, JSONL/HTML export, JSONL
import, and statistics. Web-compatible extensions can use confirm, select,
input, editor, notifications, status, widgets, and editor draft updates.
Packages, extensions, and skills have dedicated Global/Current Project settings
pages backed by Pi's real SettingsManager and DefaultPackageManager. Resource
changes respect Pi project trust, persist atomically, reload idle runtimes
immediately, and defer busy runtime reloads until `agent_settled`. Developer
settings can enable the separately packaged Pi Client distribution, store its
Pi Server token outside `config.json`, run an authenticated connection test,
and choose the default runtime for new sessions. Existing sessions keep their
original runtime binding; migration is an explicit duplicate that records its
source. MCP settings manage real global/project stdio and Streamable HTTP
servers, keep credentials in SecretStore, discover and namespace tools, expose
connection status/logs, and restart affected idle runtimes so per-tool changes
reach the actual AgentSession. Later-phase features are not shown until their
backing operation exists.

## Run the packaged app

```bash
npm install --global pi-web-codex
pi-web-codex
```

The CLI binds only to `127.0.0.1`, waits for `/api/v1/health`, and opens
<http://127.0.0.1:1816> after the server is ready. Use `pi-web-codex --help` for
host, port, browser, and config-directory options.

## Development

```bash
npx pnpm@11.12.0 install
npx pnpm@11.12.0 dev
```

Open <http://127.0.0.1:1816>.

Build and verify the standalone package with:

```bash
npx pnpm@11.12.0 test
npx pnpm@11.12.0 typecheck
npx pnpm@11.12.0 lint
npx pnpm@11.12.0 build
```

## Architecture

See [docs/architecture.md](docs/architecture.md).

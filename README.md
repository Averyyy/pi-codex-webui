# pi-web-codex

A local, single-port Web Host for Pi coding-agent workflows.

The current milestone provides the production host lifecycle, health and settings
APIs, atomic local configuration, and functional General and Appearance pages.
Unimplemented session and worker features are not exposed in the UI.

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

# Pi WebUI Extensions

WebUI Extensions are optional adapters for existing Pi Extensions. They add a
native browser view without changing Pi or the target Extension. If an Adapter
is absent, disabled, incompatible, conflicting, or fails at runtime, the Host
invokes the original Pi behavior and its Virtual TUI remains available.

## Package layout

Every built-in and external Adapter is the same ESM package:

```text
my-adapter/
├── package.json
├── dist/
│   ├── worker.mjs
│   └── client.mjs
└── src/
    ├── worker.ts
    └── client.ts
```

`package.json` owns the manifest:

```json
{
  "name": "pi-example-webui",
  "version": "1.0.0",
  "type": "module",
  "piWebCodex": {
    "apiVersion": 1,
    "host": { "version": ">=0.1.0 <1", "protocolVersion": 1 },
    "extensions": [
      {
        "id": "example",
        "target": {
          "packageName": "pi-example",
          "extensionPath": "**/index.js",
          "version": ">=1 <2",
          "testedVersions": ["1.0.0"],
          "compatibility": {
            "mode": "probe",
            "onUntestedVersion": "allow-if-probe-passes"
          }
        },
        "runtimes": ["pi", "pi-client"],
        "worker": "./dist/worker.mjs",
        "client": "./dist/client.mjs",
        "contributes": {
          "commandAdapters": [
            { "command": "example", "handler": "example.open" }
          ]
        }
      }
    ]
  }
}
```

Entrypoints must resolve inside the package. The client must be a self-contained
browser ESM bundle: it cannot import Next.js, Node.js, Host React context, or an
unbundled NPM dependency.

## Discovery and installation

The Registry reads manifests from these locations:

1. built-ins shipped in `dist/webui-extensions`;
2. packages installed in `<config>/webui-extensions/node_modules`;
3. package roots listed in `PI_WEB_CODEX_WEBUI_EXTENSION_PATHS` (separated by
   the platform path delimiter);
4. `<project>/.pi/webui-extensions/*`, only for trusted projects.

On macOS, install a published Adapter with:

```bash
npm install --prefix "$HOME/Library/Application Support/pi-web-codex/webui-extensions" pi-example-webui
```

For local development:

```bash
PI_WEB_CODEX_WEBUI_EXTENSION_PATHS=/absolute/path/to/my-adapter pnpm dev
```

Build the Adapter first. New sessions discover it immediately; restart an
already active session after installing or updating a package. No Next.js build
is required.

## Worker

The worker entrypoint runs only inside the isolated Pi session worker:

```ts
import { defineWorkerExtension } from "@pi-web-codex/extension-sdk"

export default defineWorkerExtension((web) => {
  web.registerCommandAdapter({
    id: "example.open",
    probe: (target) =>
      target.commands.has("example")
        ? { compatible: true }
        : { compatible: false, reason: "Missing example command." },
    async handle(request, context) {
      await context.openView({
        viewId: "example.dialog",
        placement: "session.dialog",
        blocking: true,
        state: { value: request.args },
      })
      return { handled: true }
    },
  })
})
```

Return `{ handled: false }`, throw, or fail client activation to close the native
view and invoke the original Pi command. Validate any payload shape that the
Adapter consumes; a failed validation must expose the fallback, not a blank UI.

## Client

The client entrypoint registers a Shadow DOM view:

```ts
import { defineClientExtension } from "@pi-web-codex/extension-sdk"

export default defineClientExtension((web) => {
  web.registerView({
    id: "example.dialog",
    mount({ container, state, close }) {
      const button = document.createElement("button")
      button.textContent = String(state)
      button.onclick = () => close()
      container.append(button)
      return { dispose: () => button.remove() }
    },
  })
})
```

Use `invoke(action, input)` for registered worker actions and `close(result)` to
resolve a blocking view. The optional `@pi-web-codex/extension-sdk/react`
entrypoint provides `defineReactView`; it requires an explicit `parseState`
function and mounts an isolated React root.

## Tests and reference implementation

`@pi-web-codex/extension-sdk/testing` exposes
`loadWorkerExtensionForTest` and `loadClientExtensionForTest` for registration
tests. A complete copyable package lives in
[`examples/minimal-adapter`](examples/minimal-adapter), while
[`builtin/conversation`](builtin/conversation) and
[`builtin/codex-conversion`](builtin/codex-conversion) exercise the exact same
manifest, worker, client, discovery, and fallback path.

See [`docs/webui-extensions/architecture.md`](../docs/webui-extensions/architecture.md)
for Host boundaries, compatibility selection, protocol, and lifecycle details.

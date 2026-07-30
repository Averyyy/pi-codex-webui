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
          ],
          "toolExecutionAdapters": [
            { "tool": "example_ask", "handler": "example.ask" }
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

  web.registerToolExecutionAdapter({
    id: "example.ask",
    async execute(request, context) {
      const answer = await context.openView({
        viewId: "example.question",
        placement: "session.dialog",
        blocking: true,
        state: request.params,
      })
      context.emitTargetEvent("example:answered", { answer })
      return {
        handled: true,
        result: {
          content: [{ type: "text", text: String(answer) }],
        },
      }
    },
  })
})
```

Return `{ handled: false }`, throw, or fail client activation to close the native
view and invoke the original Pi command. Validate any payload shape that the
Adapter consumes; a failed validation must expose the fallback, not a blank UI.

`toolExecutionAdapters` are exact tool-name contributions. Their registered
`execute` handler runs before the target tool:

- `{ handled: true, result }` replaces execution. `result` must be an object
  whose `content` is an array.
- `{ handled: false }` invokes the original target tool.
- `{ handled: false, params }` invokes the original target tool with rewritten
  params.
- Failed validation, or an exception/invalid result before any context
  side-effect API is called, marks the Adapter failed and invokes the original
  target tool.
- After `openView`, `updateView`, `closeView`, `emitTargetEvent`, or
  `invokeTargetTool` is called, a later failure returns a handled `isError`
  result and never reruns the original tool. An explicit successful
  `{ handled: false }` still requests fallback.

`context.invokeTargetTool(name, params)` is available to worker handlers and
view actions. It can call only a tool registered by the Adapter's matched target
Extension and reuses the Pi `ExtensionContext` captured when that handler or
view opened; it cannot call an unrelated session tool. The direct call bypasses
the same tool execution Adapter to avoid recursion. It does not synthesize an
assistant tool call or append a tool-result message to the transcript, so use it
only for read-only queries or target tools that own their persistence internally.
State that is persisted by normal tool-result replay must still be changed by a
normal agent tool call.

`context.emitTargetEvent(name, payload)` forwards an established target event
through the current session event bus. It is worker-only and needs no manifest
event declaration; the Adapter remains responsible for preserving the target
Extension's event name and payload contract.

Non-blocking views may set `upsertKey`. A later open from the same Adapter with
the same key updates the existing instance instead of creating another view.
The `viewId` and placement must remain stable, and blocking views cannot use
`upsertKey`.

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

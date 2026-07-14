# @pi-web-codex/extension-sdk

Public contracts for pi-web-codex WebUI Adapter workers and browser clients.

- Main entrypoint: manifest types, `defineWorkerExtension`, and
  `defineClientExtension`.
- `@pi-web-codex/extension-sdk/react`: `defineReactView` for an isolated React
  root with required state validation.
- `@pi-web-codex/extension-sdk/testing`: registration harnesses for worker and
  client entrypoints.

See the repository's
[`webui-extensions/README.md`](../../webui-extensions/README.md) and minimal
Adapter example for the complete package and fallback contract.

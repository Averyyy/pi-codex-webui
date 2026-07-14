# Minimal WebUI adapter

This package is a complete external Adapter example. It targets a hypothetical
`pi-example-greeter` Pi Extension and replaces its `/greet` command with a
native browser dialog. Copy the package, change the target and IDs, then build
it with `pnpm build`.

Use its package directory in `PI_WEB_CODEX_WEBUI_EXTENSION_PATHS` while
developing. For production, publish it to NPM and install it under the
pi-web-codex external Adapter root documented in `webui-extensions/README.md`.

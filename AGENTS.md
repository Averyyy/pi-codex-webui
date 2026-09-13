<!-- BEGIN:nextjs-agent-rules -->

# Next.js 16

Read the relevant guide in `node_modules/next/dist/docs/` before changing Next.js routes, rendering, caching, or configuration. Follow current deprecation notices.
<!-- END:nextjs-agent-rules -->

Do not stop dev server after your job is done. Other agents may still be running.

## Local package validation

- When validating an npm release, install the published `pi-web-codex` package on this machine and test that installed runtime with the local environment. Verify both the installed CLI version and the running `/api/v1/health` version. Source tests alone do not validate the published package.
- Prefer Codex's built-in browser tools for rendered UI checks. Pi-specific agent or browser workflows are not required for this repository.
- For session loading changes, verify approximately 1,000 conversations: fast initial rendering, bounded metadata requests, and automatic pagination while scrolling. Lists and search must not discover or parse session JSONL files. Refresh only explicitly selected projects or sessions.
- Use isolated fixtures for destructive and stress scenarios; preserve the user's sessions, credentials, configuration, and existing PiServer service. An explicitly requested package upgrade may restart the verified installed WebUI instance; do not stop unrelated Node processes or development servers.
- Fix reproducible defects with focused regression coverage. Do not hide failures with silent fallbacks or infer session identity from directory-name heuristics.
- Keep published-package findings separate from local source fixes. Do not publish npm packages unless explicitly requested.
- Prefer completion notifications or appropriately bounded waits to repeated 30-second polling. Keep progress updates concise.

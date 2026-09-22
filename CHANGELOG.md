# Changelog

All notable changes to `pi-web-codex` are documented here.

## [0.1.19] - 2026-09-22

### Added

- Persistent loopback WebUI instances with `--port`, `list`, `start`, and `stop`, including durable registry state, lifecycle locks, and strict process ownership checks.
- Stable-release update detection and an authenticated loopback update supervisor with staged installation, candidate health checks, rollback, and restart recovery.
- Runtime leases and private draft-session handoff so browser reconnects, updates, and draft promotion do not expose private session files.
- Persisted workspace navigation ordering, drag-and-drop movement, session focus recovery, and scoped runtime/model resource routing.

### Changed

- Expanded runtime, model settings, MCP, worker, and local mutation APIs to support the new instance and update lifecycle contracts.
- Extended release verification and CLI regression coverage for cross-platform installed artifacts, multi-instance lifecycle, update failure recovery, and settings retention across restart.

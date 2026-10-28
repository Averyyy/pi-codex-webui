# Changelog

All notable changes to `pi-web-codex` are documented here.

## [0.1.36] - 2026-10-29

### Changed

- Updated Pi Client to 1.4.0-piclient.14, Lucide icons to 1.63.0, shadcn CLI to 4.23.0, Node.js types to 26.6.6, and pnpm to 12.16.1.

## [0.1.35] - 2026-10-27

### Changed

- Updated compatible stable dependencies for Pi 1.4.0 and Pi Client 1.4.0-piclient.10.
- Preserved batch question headings in the ask-user interface and answers.

### Fixed

- Kept workspace panel toggles synchronized with keyboard and pointer collapse, and registered resize handles only for visible panel pairs.
- Allowed disposed workers to drain observer connections before exiting.
- Preserved unanswered question states when submitting partial questionnaires.

## [0.1.33] - 2026-10-04

### Added

- Added global and project agent settings for codemode, compaction, retries, and image handling.
- Added codemode tool-call presentation and live agent settings updates.

### Changed

- Routed MCP configuration and execution through the native agent runtime.
- Replaced WebUI-managed MCP connections with global and project MCP configuration.

## [0.1.28] - 2026-09-30

### Fixed

- Preserved desktop-style session viewports, composer drafts, focus, and navigation state across session switches.
- Kept session history and runtime snapshots consistent while sessions are active, replaced, cancelled, or changed externally.
- Added bounded viewport retention, typed missing-session handling, and isolated launcher test environments.

## [0.1.26] - 2026-09-29

### Added

- Added explicit project conversation refresh for sessions written outside the WebUI, with visible partial-scan errors.

### Fixed

- Removed deleted project conversations only after a complete scan and kept other projects' sessions untouched.
- Revalidated session model catalogs against current project and authentication state, including after resource-cache eviction.

### Changed

- Reloaded local model settings without triggering provider discovery.

## [0.1.24] - 2026-09-28

### Fixed

- Failed catalog-reader close waits now return a bounded, retryable error.

### Changed

- Retained scoped model and extension catalogs with bounded reads, explicit invalidation, and serialized shared-file updates.
- Preserved session controllers, leases, event cursors, drafts, and extension state across navigation while bounding worker and connection lifetimes.
- Unified project trust decisions, guarded against stale refresh responses and snapshot races, and kept Git status and diff queries read-only.
- Added opt-in catalog and session diagnostics.

## [0.1.19] - 2026-09-22

### Added

- Persistent loopback WebUI instances with `--port`, `list`, `start`, and `stop`, including durable registry state, lifecycle locks, and strict process ownership checks.
- Stable-release update detection and an authenticated loopback update supervisor with staged installation, candidate health checks, rollback, and restart recovery.
- Runtime leases and private draft-session handoff so browser reconnects, updates, and draft promotion do not expose private session files.
- Persisted workspace navigation ordering, drag-and-drop movement, session focus recovery, and scoped runtime/model resource routing.

### Changed

- Expanded runtime, model settings, MCP, worker, and local mutation APIs to support the new instance and update lifecycle contracts.
- Extended release verification and CLI regression coverage for cross-platform installed artifacts, multi-instance lifecycle, update failure recovery, and settings retention across restart.

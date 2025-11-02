# Dashboard Automation Instructions

## Scope

These instructions apply to all files under `dashboard/` unless superseded by nested briefs.

## Goals

- Maintain the host runtime that sequences applet games, enforces timers, and coordinates scoring.
- Keep the host ↔ applet contract stable. If a breaking change is required, bump the message version (`v2`) and document it in `dashboard/docs/host-overview.md`.
- Prefer declarative configuration (registry, playlists) over hard-coded logic.

## Conventions

- Message types use `namespace.action` naming (e.g., `host.start`).
- Registry files are JSON with double quotes. Sort entries alphabetically by `id`.
- Shared TypeScript/JavaScript utilities live in `dashboard/runtime/`.
- Document every new capability in `dashboard/docs/host-overview.md` and provide a stub implementation in `dashboard/runtime/capabilities/`.

## Required checks before commit

1. Validate registry schema (`node scripts/validate-registry.js`, once implemented).
2. Ensure telemetry docs stay in sync when new events are added.
3. Update playlists if a new difficulty tier is introduced.

## Common tasks

- **Add playlist**: create YAML in `ops/choreography/`, update documentation references.
- **Add HUD feature**: implement in `dashboard/ui/`, gate behind feature flag in registry if experimental.
- **Handle applet failure case**: log via telemetry and advance playlist without blocking.

## Anti-goals

- Do not embed applet-specific assets or logic in the dashboard.
- Do not assume a specific rendering tech (applets may be Canvas, WebGL, DOM, etc.).

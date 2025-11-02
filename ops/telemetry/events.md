# Telemetry Reference

Events are recorded as line-delimited JSON in `ops/telemetry/dev-log.ndjson` during development. Each event includes `timestamp`, `sessionId`, `version`, and an `event` object.

## Event types

- `session_start` – `{ playlistId, seed, stageCount }`
- `session_end` – `{ playlistId, totalScore, streakBest, failures, durationMs }`
- `applet_mount` – `{ appletId, stageName, loadMs, success, error? }`
- `applet_result` – `{ appletId, outcome, scoreDelta, durationMs, remainingMs, streak }`
- `applet_timeout` – `{ appletId, elapsedMs }`
- `error` – `{ stage, message, fatal }`

## Viewing telemetry

1. Tail the dev log: `tail -f ops/telemetry/dev-log.ndjson`.
2. Pipe into `jq` for filtering: `tail -f ops/telemetry/dev-log.ndjson | jq 'select(.event.type=="applet_result")'`.
3. For dashboards, import the NDJSON into your preferred log viewer.

## Emission guidelines

- Emit `applet_mount` immediately after the sandbox resolves (`success: true/false`).
- Emit `applet_result` exactly once per applet run.
- On timeout, emit both `applet_timeout` and a failure `applet_result`.
- Fatal errors should also trigger `host.end` to protect session flow.

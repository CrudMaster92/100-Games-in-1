# Dashboard → Applet Host Overview

This brief defines how the dashboard launches, supervises, and scores standalone minigame applets. Treat it as the contract of record for any automation or manual contributor.

## Architecture snapshot

- **Host runtime**: Responsible for sequencing applets, enforcing timers, owning the global score/combo, and rendering lightweight HUD overlays.
- **Applets**: Self-contained bundles mounted into an isolated surface (iframe by default, alternative sandboxes allowed if they preserve isolation and message compatibility).
- **Message bus**: Structured postMessage (or equivalent) channel scoped to a session id and version, carrying typed events between host and applet.
- **Registry**: Declarative metadata (`dashboard/registry/applets.json`) describing all available applets, their assets, duration constraints, and difficulty tags.
- **Playlists**: Ordered or weighted mixes of registry entries that define a session (`ops/choreography/*.yaml`).

## Host ↔ Applet contract

| Concern | Host responsibility | Applet responsibility |
| --- | --- | --- |
| Bootstrap | Instantiate sandbox, inject `sessionContext` {`sessionId`, `appletId`, `seed`, `difficulty`, `timeBudgetMs`, `capabilities`} and wait up to 1200 ms for `applet.ready`. | Load all assets within sandbox, acknowledge with `applet.ready` before the deadline. |
| Game loop | Emit control messages (`host.start`, `host.setDifficulty`, etc.) and enforce timers; exit on success, failure, or timeout. | React to control messages, run gameplay, and emit outcome events. |
| Scoring | Maintain cumulative score and streaks. | Report only deltas via `applet.progress` and `applet.result`. |
| Error handling | If an applet fails to mount or errors, log `applet.error`, advance playlist, and mark failure. | Surface recoverable issues via `applet.error` and optional `applet.needsHint`. |
| Capabilities | Provide namespaced helpers (`storage`, `sfx`, `rng`, `telemetry`, etc.) on request, versioned per session. | Invoke only declared capabilities; fail gracefully when unavailable. |

### Message catalogue (v1)

All messages travel as JSON objects with a `type` string, `sessionId`, and optional `payload`.

**Host → Applet**

- `host.bootstrap` – sent immediately on sandbox mount with the session context.
- `host.start` – begin gameplay timer.
- `host.setDifficulty` – payload `{level}`.
- `host.setTimeBudget` – payload `{remainingMs}` updates.
- `host.pause` / `host.resume` – pause or resume timers and input.
- `host.end` – force-terminate the applet (playlist advance).
- `host.provideCapability` – payload `{name, version, endpoint}` (optional per applet).
- `host.viewport` – payload `{width, height}` announcing the current sandbox size. Sent on mount and whenever the viewport resizes.

**Applet → Host**

- `applet.ready` – acknowledges bootstrap and readiness.
- `applet.progress` – payload `{percent?, state?, scoreDelta?}` for HUD updates.
- `applet.result` – payload `{outcome: "success"|"fail"|"timeout", scoreDelta, reason?}`.
- `applet.needsHint` – payload `{hintCode}` to request host UI help.
- `applet.error` – payload `{stage, message, fatal}` for diagnostics.

### Capability surface

Capabilities are optional; each applet declares required ones in its manifest. Host may expose:

- `storage` – scoped key/value storage under `sessionId/appletId`.
- `audio` – fire-and-forget cues by key (`blip`, `fail`, `success`).
- `haptics` – vibrate patterns (mobile devices only).
- `rng` – deterministic PRNG seeded from session context.
- `http` – limited fetch proxy for curated endpoints.
- `telemetry` – structured event logger (see below).

## Session choreography

1. **Playlist load**: Select playlist file (default `ops/choreography/playlist-sample.yaml`).
2. **Seed init**: Use playlist or CLI-provided seed to seed RNG.
3. **Session loop**:
   1. Pop next candidate via playlist policy (weighted random respecting difficulty ramp and ban rules).
   2. Allocate time budget: clamp between applet `minDurationMs` and `maxDurationMs`, modulated by ramp stage.
   3. Mount applet sandbox; dispatch `host.bootstrap`.
   4. If `applet.ready` not received in 1200 ms, emit failure telemetry, mark applet as failed, and advance.
   5. On `host.start`, start timer; broadcast `host.setTimeBudget` ticks every 200 ms.
   6. On `applet.result`, evaluate outcome and add score delta; update streaks/combos.
   7. On timeout, send `host.end` with outcome `timeout` and advance.
4. **Session end**: After playlist exhaustion or player fail count threshold, emit summary telemetry and return to dashboard menu.

## Registry model

`dashboard/registry/applets.json` contains an array of applet descriptors:

```json
{
  "id": "quick-tap",
  "name": "Quick Tap",
  "version": "1.0.0",
  "entry": "applets/quick-tap/index.html",
  "icon": "applets/quick-tap/assets/icon.png",
  "minDurationMs": 12000,
  "maxDurationMs": 20000,
  "difficulty": ["easy"],
  "themes": ["arcade"],
  "weights": {"easy": 1.0, "medium": 0.5, "hard": 0.2},
  "capabilities": ["audio", "rng"],
  "prerequisites": [],
  "notes": "Tap the highlighted targets before time runs out."
}
```

Agents add new applets by appending similar entries. Validation should warn on missing fields but fail on duplicate ids or unsupported capability names.

## Telemetry

Minimal schema (see `ops/telemetry/events.md` for examples):

- `session_start`, `session_end`
- `applet_mount` (fields: `appletId`, `loadMs`, `success`)
- `applet_result` (fields: `appletId`, `outcome`, `scoreDelta`, `durationMs`)
- `error` (fields: `stage`, `message`, `fatal`)

Telemetry events stream to `ops/telemetry/dev-log.ndjson` during development. Production deployments should plug into a persistent sink.

## QA & acceptance checklist

- Applet boots and fires `applet.ready` in < 1000 ms on reference hardware.
- Applet never mutates host globals or DOM outside its sandbox.
- Applet respects `host.end` and `host.pause` within 200 ms.
- Applet emits `applet.result` exactly once per run.
- Host recovers from crash/timeout by advancing playlist and logging `applet.error`.

## Adding a new applet (summary)

1. Copy `applets/template` to a new folder name (kebab-case).
2. Customize manifest (`manifest.json`), docs, and assets inside the new folder.
3. Register the applet in `dashboard/registry/applets.json` with durations, weights, and capability list.
4. Update playlist(s) if you want deterministic inclusion; otherwise, rely on weighted random.
5. Run QA checklist from `ops/guides/qa-checklist.md` before merging.

Refer to `ops/guides/add-applet.md` for the complete walkthrough.

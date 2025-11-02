# Orb Dodge

- **Outcome**: Survive the barrage of orbs until timer expires.
- **Controls**: Arrow keys / WASD or swipe drag.
- **Messages listened**: `host.start`, `host.setDifficulty`, `host.setTimeBudget`, `host.pause`, `host.resume`, `host.end`.
- **Messages emitted**: `applet.ready`, `applet.progress`, `applet.result`, `applet.error`.
- **Time window**: Ideal 20 s, hard max 28 s.
- **Capabilities**: `audio`, `rng`, `telemetry`.

## Difficulty ramp

- **Medium**: Moderate orb spawn rate, single orb type.
- **Hard**: Faster spawn, homing orbs, smaller safe zone.

## Implementation sketch

1. On `host.bootstrap`, initialize physics loop and RNG for spawn patterns.
2. On `host.start`, begin spawn interval and countdown overlay.
3. Emit `applet.progress` every second with `{percent}` survival progress.
4. If player hit, emit `applet.result` with `fail` and `scoreDelta` = `-150`.
5. If timer finishes, emit `success` with `scoreDelta` = `200 + streakBonus`.
6. Send custom telemetry via `telemetry.emit('orb_dodge_hit', {...})` when collisions occur.

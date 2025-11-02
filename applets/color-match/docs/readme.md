# Color Match

- **Outcome**: Pick the palette tile that matches the prompted RGB code before the timer drains.
- **Controls**: Mouse/touch to select tiles; optional keyboard (1–4) binding.
- **Messages listened**: `host.start`, `host.setDifficulty`, `host.setTimeBudget`, `host.pause`, `host.resume`, `host.end`.
- **Messages emitted**: `applet.ready`, `applet.progress`, `applet.result`, `applet.error`, `applet.needsHint` (optional).
- **Time window**: Ideal 18 s, hard max 25 s.
- **Capabilities**: `audio`, `storage` (for personal best streaks).

## Difficulty ramp

- **Easy**: 3 tiles, basic colors.
- **Medium**: 4 tiles, closer hues, shorter timer.

## Implementation sketch

1. On `host.bootstrap`, load persisted streak from `storage` if available.
2. On `host.start`, randomize palette using seed; show prompt text.
3. On selection, emit `applet.progress` with streak info.
4. On success, emit `applet.result` with `scoreDelta` = `100 + remainingMs / 50`.
5. On three wrong picks, emit failure result.

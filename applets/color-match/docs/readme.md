# Color Match

- **Outcome**: Pick the palette tile that matches the prompted RGB code before the timer drains.
- **Controls**: Mouse/touch to select tiles; optional keyboard bindings (`1–4`).
- **Messages listened**: `host.bootstrap`, `host.start`, `host.setDifficulty`, `host.setTimeBudget`, `host.pause`, `host.resume`, `host.end`, `host.provideCapability`.
- **Messages emitted**: `applet.ready`, `applet.progress`, `applet.result`, `applet.error`, `applet.needsHint`.
- **Time window**: Ideal 18 s, hard max 25 s.
- **Capabilities**: `audio`, `storage` (for persistent streak and best streak).

## Difficulty ramp

- **Easy**: 3 tiles, high contrast colours.
- **Medium**: 4 tiles, closer hues, slightly shorter timer.

## Implementation notes

1. On `host.bootstrap`, load persisted streak stats from `storage` if available.
2. `host.start` seeds a deterministic palette based on the session seed and chosen difficulty.
3. Wrong picks reduce the remaining mistake budget (max three); after two misses, the applet requests a host hint.
4. On success, emit `applet.result` with `scoreDelta = 100 + remainingMs / 50` and update persistent streak records.
5. On failure or timeout, reset the streak, emit `applet.result` with a negative score delta, and cleanly stop timers.

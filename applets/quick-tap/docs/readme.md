# Quick Tap

- **Outcome**: Tap all highlighted pads before timer expires.
- **Controls**: Mouse or touch clicks.
- **Messages listened**: `host.start`, `host.setDifficulty`, `host.setTimeBudget`, `host.pause`, `host.resume`, `host.end`.
- **Messages emitted**: `applet.ready`, `applet.progress`, `applet.result`, `applet.error`.
- **Time window**: Ideal 15 s, hard max 20 s.
- **Capabilities**: `audio`, `rng`.

## Implementation sketch

1. On `host.bootstrap`, seed RNG and pre-generate pad order.
2. On `host.start`, activate first pad and begin countdown.
3. Each successful tap increases score delta (`+50`) and advances to next pad.
4. Emit `applet.result` with `success` when all pads are cleared; include total taps per second.
5. On miss or timeout, emit `applet.result` with `fail` and reason.

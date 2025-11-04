# Quick Tap

- **Outcome**: Clear a full sequence of glowing pads before the timer expires.
- **Controls**: Mouse or touch clicks on the highlighted pad.
- **Messages listened**: `host.bootstrap`, `host.start`, `host.setDifficulty`, `host.setTimeBudget`, `host.pause`, `host.resume`, `host.end`, `host.provideCapability`.
- **Messages emitted**: `applet.ready`, `applet.progress`, `applet.result`, `applet.error`.
- **Time window**: Ideal 15 s, hard max 20 s.
- **Capabilities**: `audio`, `rng`.

## Gameplay

Six pressure pads are arranged in a 3×2 grid. The host provides a deterministic seed so the applet can pre-generate a repeatable sequence of pads to highlight. When the host sends `host.start` the following loop begins:

1. Highlight the next pad and display its index in the HUD.
2. If the player taps the correct pad in time, award +50 score, increment the cleared count, and queue up the next highlight.
3. A wrong tap immediately ends the run with a failure result.
4. When the final pad is cleared, emit `applet.result` with `success`, total taps, elapsed time, and taps-per-second.
5. If the timer hits zero beforehand, emit `applet.result` with `timeout`.

Difficulty modifies the sequence length and highlight pacing:

- **Easy** – 10 pads, ~0.32 s between highlights.
- **Medium** – 14 pads, ~0.26 s between highlights.
- **Hard** – 18 pads, ~0.22 s between highlights.

## Host contract notes

- Emits `applet.ready` after `host.bootstrap` is received and capabilities are cached.
- `host.setTimeBudget` updates the live deadline when running or stores the new budget for the next round otherwise.
- `host.pause` freezes the countdown and pending highlight; `host.resume` reapplies the remaining delay before the next pad.
- `host.provideCapability` is used to receive the audio endpoint when the host grants it at runtime.
- The applet reports progress as the fraction of pads cleared (0–1 range) and includes small score deltas with each success pulse.

## Build & testing

The applet is plain HTML/CSS/JS and requires no build step. Open `applets/quick-tap/index.html` directly in a browser for standalone testing; it will auto-bootstrap with a local seed when no host is detected.

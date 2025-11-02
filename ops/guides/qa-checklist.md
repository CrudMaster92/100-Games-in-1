# Minigame QA Checklist

Use this list before registering or promoting an applet.

- [ ] Boot time under 1000 ms on reference hardware (Chrome desktop profile).
- [ ] Emits `applet.ready` once and only after gameplay assets are loaded.
- [ ] Responds to `host.start`, `host.pause`, `host.resume`, and `host.end`.
- [ ] Honors the time budget: shows countdown, stops gameplay when timer expires.
- [ ] Sends `applet.result` exactly once, with a valid `outcome` and `scoreDelta`.
- [ ] Handles missing optional capabilities gracefully (feature detection).
- [ ] Cleans up timers/listeners on `host.end` to avoid leaks.
- [ ] Emits `applet.error` with actionable message when something goes wrong.
- [ ] Exposes controls or instructions within the sandbox (no reliance on host HUD).

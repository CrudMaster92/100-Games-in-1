# Applet Template

Use this template as the starting point for new minigames. Replace placeholders with real values.

## Manifest fields

```json
{
  "id": "template-id",
  "name": "Template Name",
  "version": "0.1.0",
  "entry": "applets/template/index.html",
  "icon": "applets/template/assets/icon.png",
  "idealDurationMs": 15000,
  "minDurationMs": 12000,
  "maxDurationMs": 20000,
  "capabilities": ["audio"],
  "inputs": ["host.start", "host.setDifficulty", "host.setTimeBudget", "host.pause", "host.resume", "host.end"],
  "outputs": ["applet.ready", "applet.progress", "applet.result", "applet.error"],
  "tags": ["easy", "tutorial"],
  "assets": {
    "local": ["assets/spritesheet.png"],
    "shared": ["dashboard/public/sfx/blip.wav"]
  }
}
```

## Lifecycle expectations

1. Receive `host.bootstrap` with context.
2. Load assets, set up state, and emit `applet.ready`.
3. Await `host.start`; begin gameplay and local timers.
4. Emit periodic `applet.progress` (optional) for HUD hints.
5. Emit `applet.result` on success/fail; clean up event listeners.
6. On `host.end`, stop timers and revert state even if result already sent.

## Controls & UX

- Display instructions within the sandbox immediately after `host.start`.
- Keep visuals within 16:9 safe area; host HUD may cover outer 5% margins.
- Use host audio cues when possible (`sessionContext.capabilities.audio`).

## Testing notes

- Simulate timeouts by ignoring `host.start` for > `timeBudgetMs` to ensure fallback behavior.
- Verify deterministic paths by seeding RNG with `sessionContext.seed`.
- Capture telemetry output to confirm `applet_result` events.

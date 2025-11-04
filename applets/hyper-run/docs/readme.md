# Hyper Run

Hyper Run is a neon-soaked sprint where the runner is already at full speed and the only way to survive is to weave between incoming energy barriers. Stay alive for twelve seconds to clear the gauntlet.

## Goal
- Survive the obstacle gauntlet for **12 seconds** without colliding with a barrier.
- Earn bonus score based on the distance covered while sprinting.

## Controls
- **Arrow Up / W** – Shift one lane up.
- **Arrow Down / S** – Shift one lane down.
- Lane changes are instant, but the runner eases into the lane to keep motion smooth.

## Host integration
- Dispatches `applet.ready` after `host.bootstrap`.
- Responds to `host.start`, `host.pause`, `host.resume`, `host.end`, `host.setDifficulty`, and `host.setTimeBudget`.
- Emits `applet.progress` updates roughly every 250ms with the percent of time survived.
- Emits `applet.result` with `success` on survival, `fail` on collision, or `timeout` if the host forces expiry.

## Difficulty tuning
- **Easy**: Slower forward speed with wider spawn gaps.
- **Medium**: Default pacing intended for new players.
- **Hard**: Faster barriers and shorter spawn intervals requiring precise timing.

## Standalone testing
Open `applets/hyper-run/index.html` directly in a browser. When no host is detected, the applet auto-bootstraps with a random seed and starts immediately.

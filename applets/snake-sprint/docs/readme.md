# Snake Sprint

Snake Sprint is a bite-sized snake challenge designed to demo the dashboard host. The snake is already mid-run and you have only
10 seconds to reach the flashing snack. The applet demonstrates:

- Immediate gameplay start after `host.start`
- Countdown pressure with host progress updates
- Pause/resume and host-driven termination handling

## Controls

- **Arrow keys / WASD** – Steer the snake without reversing direction.

The snake begins partway down the board and faces right toward the flashing food. Touch the food before the 10-second countdown
ends to win; otherwise, the applet emits a timeout failure.

## Messaging contract

- Emits `applet.ready` once assets are loaded.
- Starts action on `host.start`, and adjusts internal timers when receiving `host.setTimeBudget`.
- Responds to `host.pause`, `host.resume`, and `host.end` within 200 ms.
- Sends `applet.progress` updates during the sprint and a single `applet.result` on win/lose.

## Build & assets

No build step is required. All assets (including `assets/icon.svg`) are shipped inline.

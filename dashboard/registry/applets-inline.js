// Auto-generated from applets.json by build-inline.js.
// Supports offline test cabinet fallback when the dashboard is opened via the file:// protocol.
(function() {
  window.__APPLET_REGISTRY__ = [
  {
    "id": "color-match",
    "name": "Color Match",
    "version": "1.0.0",
    "entry": "applets/color-match/index.html",
    "icon": "applets/color-match/assets/icon.png",
    "minDurationMs": 15000,
    "maxDurationMs": 25000,
    "difficulty": [
      "easy",
      "medium"
    ],
    "themes": [
      "neon"
    ],
    "weights": {
      "easy": 0.8,
      "medium": 1,
      "hard": 0.6
    },
    "capabilities": [
      "audio",
      "storage"
    ],
    "prerequisites": [],
    "notes": "Match the prompted color faster than the clock."
  },
  {
    "id": "orb-dodge",
    "name": "Orb Dodge",
    "version": "0.9.0",
    "entry": "applets/orb-dodge/index.html",
    "icon": "applets/orb-dodge/assets/icon.png",
    "minDurationMs": 18000,
    "maxDurationMs": 28000,
    "difficulty": [
      "medium",
      "hard"
    ],
    "themes": [
      "space"
    ],
    "weights": {
      "easy": 0.2,
      "medium": 0.9,
      "hard": 1
    },
    "capabilities": [
      "audio",
      "rng",
      "telemetry"
    ],
    "prerequisites": [
      "quick-tap"
    ],
    "notes": "Dodge incoming orbs; survival awards combo bonuses."
  },
  {
    "id": "quick-tap",
    "name": "Quick Tap",
    "version": "1.0.0",
    "entry": "applets/quick-tap/index.html",
    "icon": "applets/quick-tap/assets/icon.png",
    "minDurationMs": 12000,
    "maxDurationMs": 20000,
    "difficulty": [
      "easy"
    ],
    "themes": [
      "arcade"
    ],
    "weights": {
      "easy": 1,
      "medium": 0.5,
      "hard": 0.2
    },
    "capabilities": [
      "audio",
      "rng"
    ],
    "prerequisites": [],
    "notes": "Tap highlighted targets before the timer expires."
  },
  {
    "id": "snake-sprint",
    "name": "Snake Sprint",
    "version": "1.0.0",
    "entry": "applets/snake-sprint/index.html",
    "icon": "applets/snake-sprint/assets/icon.svg",
    "minDurationMs": 9000,
    "maxDurationMs": 12000,
    "difficulty": [
      "easy",
      "medium"
    ],
    "themes": [
      "arcade"
    ],
    "weights": {
      "easy": 0.9,
      "medium": 0.8,
      "hard": 0.4
    },
    "capabilities": [],
    "prerequisites": [],
    "notes": "Guide the mid-run snake to the flashing snack before the timer drains."
  }
];
})();

# Host–Applet Message Map (v1)

| Direction | Type | Payload schema | When sent | Notes |
| --- | --- | --- | --- | --- |
| Host → Applet | `host.bootstrap` | `{ sessionId, appletId, version, difficulty, timeBudgetMs, seed, capabilities }` | Immediately after sandbox mount. | Applets must respond with `applet.ready` within 1200 ms. |
| Host → Applet | `host.start` | `{}` | When gameplay should begin. | Applets start timers and input listeners. |
| Host → Applet | `host.setDifficulty` | `{ level }` | When playlist increases difficulty or applet requests adjustment. | Levels: `easy`, `medium`, `hard`, custom strings allowed. |
| Host → Applet | `host.setTimeBudget` | `{ remainingMs }` | Every 200 ms tick (or when budget changes). | Optional for applets that manage their own timers. |
| Host → Applet | `host.pause` | `{ reason? }` | Pause triggered (menu, focus loss). | Applets must stop timers and animations. |
| Host → Applet | `host.resume` | `{}` | Resume after pause. | Applets resume timers respecting new `remainingMs`. |
| Host → Applet | `host.end` | `{ outcome? }` | Host force-ends run (timeout, failure, skip). | Applets should clean up and stop emitting progress. |
| Host → Applet | `host.provideCapability` | `{ name, version, endpoint }` | When optional capabilities become available. | Capabilities accessed via `sessionContext.capabilities[name]`. |
| Applet → Host | `applet.ready` | `{ loadMs? }` | After initialization completes. | Host starts the run only after receiving this. |
| Applet → Host | `applet.progress` | `{ percent?, state?, scoreDelta?, hint? }` | Periodic progress updates. | Host uses for HUD and streak logic. |
| Applet → Host | `applet.result` | `{ outcome, scoreDelta, reason?, stats? }` | End of run. | Outcome must be one of `success`, `fail`, `timeout`. |
| Applet → Host | `applet.needsHint` | `{ hintCode, context? }` | Applet wants host HUD to display guidance. | Host may ignore if no hint system configured. |
| Applet → Host | `applet.error` | `{ stage, message, fatal }` | On recoverable or fatal errors. | Host logs telemetry and may abort run when `fatal` is true. |

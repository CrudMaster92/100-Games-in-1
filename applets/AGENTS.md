# Applet Development Instructions

## Scope

Applies to every directory under `applets/` unless overridden by nested docs.

## Principles

- Applets must be self-contained bundles: no shared globals, no reliance on other applet code.
- Communicate exclusively through the host messaging API defined in `dashboard/docs/host-overview.md`.
- Provide clear docs for controls, win/fail conditions, and timing expectations.

## File conventions

- Include a `manifest.json` describing identity, entry file, capabilities, and timing.
- Place documentation in `docs/readme.md` (lowercase) within each applet.
- Assets live under `assets/`; keep them namespaced to avoid collisions.
- Include a lightweight build script or note if none is required.

## Required hooks

- Dispatch `applet.ready` when initialization finishes.
- Respond to `host.start`, `host.pause`, `host.resume`, and `host.end`.
- Emit `applet.result` with `outcome` (`success`/`fail`/`timeout`) and `scoreDelta`.
- On recoverable issues, emit `applet.error` and return control to the host.

## Testing checklist

1. Verify deterministic behavior when seeded (use `sessionContext.seed`).
2. Confirm time budget is respected.
3. Run the QA checklist in `ops/guides/qa-checklist.md`.

## Anti-goals

- Do not reference files outside your applet folder except shared host assets specified in your manifest.
- Do not modify dashboard registry files from within an applet.

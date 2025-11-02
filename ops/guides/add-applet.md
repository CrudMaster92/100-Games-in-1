# Add a New Applet – Runbook

1. **Clone template**
   - Copy `applets/template` to `applets/<your-applet-id>` (use kebab-case).
   - Update `package.json` (if used), `manifest.json`, and documentation placeholders.
2. **Declare manifest**
   - Set `id`, `name`, `version`, `entry`, `capabilities`, `minDurationMs`, `maxDurationMs`, and `idealDurationMs`.
   - List expected host messages under `inputs` and emitted events under `outputs`.
3. **Implement gameplay**
   - Keep logic self-contained. Avoid referencing global `window` outside sandbox.
   - Use host-provided capabilities via the `sessionContext.capabilities` map.
4. **Instrument telemetry**
   - Call `telemetry.emit('applet_event', {...})` when available.
   - Emit `applet.result` exactly once with `outcome` + `scoreDelta`.
5. **Register applet**
   - Add entry to `dashboard/registry/applets.json` matching manifest fields.
   - Include icon path and optional notes for the dashboard.
6. **Update playlists (optional)**
   - Add your applet id to `ops/choreography/*.yaml` stages if it must appear.
7. **Run QA checklist**
   - Follow `ops/guides/qa-checklist.md` end-to-end.
   - Capture telemetry logs for verification.
8. **Document**
   - Update `applets/<id>/docs/readme.md` with rules, controls, and failure modes.
9. **Submit**
   - Ensure lint/tests pass, open PR with summary, attach telemetry snapshot.

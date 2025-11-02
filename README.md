# 100 Games in 1

This repository contains the scaffolding, documentation, and automation instructions for building a rapid-fire collection of minigame applets that plug into a shared dashboard host. The goal is to make it easy for agents and contributors to add new games, iterate on the host experience, and keep the host–applet contract clean and versioned.

## Structure

- `dashboard/` – Host runtime, registry, sequencing logic, shared UI, and automation briefs.
- `applets/` – Standalone minigame applets, each self-contained with its own docs, assets, and build steps.
- `ops/` – Operational docs for playlists, telemetry, QA workflows, and future roadmap items.

See `dashboard/docs/host-overview.md` for the complete contract, sequencing, and telemetry reference.

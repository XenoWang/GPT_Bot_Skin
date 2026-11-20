---
name: codex-skin-usage
description: Install, launch, switch, restore or troubleshoot local Codex Desktop Skins on Windows. Uses its bundled runtime, existing launch configuration and per-Skin opacity/language settings.
---

# Codex Skin usage

This package is self-contained. Resolve paths from this folder; no Creator or sibling runtime is required.

For a running client, use **主题 / Skin** to switch themes, change layout/opacity or language. Reuse known configuration and user choices; daily adjustments need no new inventory or environment scan.

When local state is unknown, run `python Inspect-Skin.py status` once. Brief JSON combines theme/version/configuration metadata without starting anything. `--state <session.json>` includes an explicitly known session's saved status; `--format full` adds details only when needed. Disk snapshots are not live identity or visual verification.

Load only the relevant reference:

- Configuration, start or restore: [launch](references/launch.md).
- Actual failure: `python Inspect-Skin.py recovery --query "<symptom>" --language <locale>` returns at most three cases. Read [recovery](references/recovery.md) to record a verified fix. Never preload the catalog/history or automatically execute suggested fixes.
- Version limits: [compatibility](references/compatibility.md). Language edits: [localization](references/localization.md).
- Packaging: `python Build-Zip.py --output <new-zip-outside-package>` uses the reviewed allowlist.

Preserve the official Store client, login/profile, existing launch route and network choice. Never patch app files, force-close a client, weaken owner checks or silently migrate Python/PowerShell state. Prefer exact profiles. Versions at or above the configured minimum use its profile. Record client and profile versions separately when investigating UI changes. Inspect relevant visible UI only; exclude external pages and protected contents. Loaded status or matched selectors do not prove visual correctness.

Report actual results and limits. Private recovery records never grant approval, erase failures or enter releases. README is the full manual; routine switching need not load it.

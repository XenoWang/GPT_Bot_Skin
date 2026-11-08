---
name: codex-skin-usage
description: Install, launch, switch, restore, or troubleshoot local Codex Desktop Skins on Windows using the official Store client and loopback CDP. Use for this Skin package, its launcher, opacity controls, or translation files.
---

# Codex Skin usage

Use the bundled runtime in `runtime/`; resolve paths from this Skill folder. No sibling package is required. Read [README.md](README.md) for first-run commands, proxy/direct options, switching and restoration. Read [compatibility.md](references/compatibility.md) for current verification boundaries.

If the user requests Python or cannot use PowerShell, use the additional `Start-Skin.py` route documented in README. It has explicit configure/start/restore/doctor actions and separate configuration/state. Existing CMD/PowerShell commands stay available; do not change the user's old launcher, shortcut or running session. Python and Node plus the official client must still be allowed by OS policy. Identity-check failure stops the operation, never enables weaker checks or a hidden PowerShell fallback.

1. Inspect the local official Codex Store package and Node 22+ availability. Keep the existing login/profile. Do not patch, replace, resign, copy, or take ownership of official app files.
2. On first use, choose local HTTP proxy or direct from the user's existing preference; ask only if genuinely unknown. Configure via `runtime/scripts/Configure-CodexSkin.ps1`. Creating a requested desktop shortcut is supported by `-DesktopShortcut`. Never silently change a running client's network mode or system proxy.
3. Start `runtime/scripts/Start-CodexTheme.ps1` with Windows PowerShell. It validates executable, PID/start time, browser ID and loopback ownership before injection. Reuse only the recorded session. If the client lacks managed CDP, ask the user to save their input and exit normally; `-WaitForExit` waits up to ten minutes. Never force-close the client.
4. Verify `status.json` and the actual window. `active` alone is not proof that every page is themed. Only official known app documents are eligible; keep external websites and credentials out of the injector.
5. Use the native **主题 / Skin** button above Usage to switch/import packs, choose sidebar layout, adjust dynamically listed opacity values or select language. Preferences are per Skin; auto language follows GPT UI with English fallback. Imported packs are data-only.
6. For removal use `Restore-CodexAppearance.ps1`, then normal app exit/reopen closes the CDP listener. Restoring original appearance in the panel keeps the manager available. Never delete the user's app profile or imported Skin database.

For a visual gap, inspect the actual visible node, inner surfaces and pseudo-elements before updating the versioned adapter. Keep selector changes scoped; do not recolor all gray pixels. Translate new locales using [localization.md](references/localization.md). Report exact checks and unverified behavior; honor the user's test approval workflow when modifying this package.

For packaging, use this folder's `Build-Zip.py` and reviewed `release-manifest.json`; never zip private state indiscriminately.

For an older client, backward compatibility is unsupported by default. Run `Inspect-UI.ps1`, collect relevant pages/states with UI tools, and use the local catalog to plan adapter changes. Never treat an unobserved region as absent or a matched selector as a visual pass. A separate Creator package is optional for authoring; it is not a dependency for this package's launch, use or inspection.

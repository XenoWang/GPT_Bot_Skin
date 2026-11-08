---
name: codex-skin-creator
description: Create unified or separate-image Codex Desktop Skins through measured UI inventory, protected image cropping, staged native previews and data-only export. Use for Skin authoring or version-specific native surface adaptation, not ordinary wallpaper generation or daily Skin switching.
---

# Codex Skin creator

Use the maintained CLI in `scripts/creator.mjs`; do not reconstruct its geometry, state machine or pack validation in chat. All runtime services are bundled in `runtime/`. The original route requires Node 22+ and Windows PowerShell. Sessions belong in ignored `work/`. Preserve installed Skins, approved originals and personal configuration.

An additional Python 3.10+ route is available through `Create-Skin.py`, using the same CLI arguments. Select it when the user wants Python or PowerShell is unavailable. That route uses Python Windows host/image services, still requires Node 22+, and uses a separate managed session created by this package's `Start-Skin.py`. Do not replace the user's existing launch route or configuration. OS policies still apply; do not modify them or silently fall back to PowerShell. See the [README](README.md).

## Start and resume

For a new creation, **start with inventory by default**:

```powershell
node scripts/creator.mjs start --session work/my-skin --state "<managed-session.json>" --id my-skin --name "My Skin"
```

Run commands from the extracted package folder. Resolve the intended managed session through this package's configuration or an explicitly supplied compatible session; do not guess a port, read credentials, change network settings or force-close Codex. An unconfigured client can use this package's own Configure/Start entrypoints. No sibling package is required. Never run a real inventory merely while implementing or testing this Skill.

For continuation, run `status` with the same `--session`; reuse confirmed choices. Read [the command reference](references/authoring-cli.md) for the current step only. The CLI automatically visits mapped safe navigation entries and sidebar states, measures the maximized canvas, generates `catalog/index.html` plus numbered SVG layouts, and records every gap. It does not manufacture chats, dialogs or question cards to improve coverage. Use permitted UI tools for remaining available states, then `capture`; do not claim unvisited states passed.

Show the measured numbered diagram and matching region table. Explain coverage gaps together, without making the user inspect each selector. Unknown mappings or unsupported versions require adapter work before being called supported. Backward compatibility is not promised.

If settings remain unvisited, open the native Settings entry with permitted UI tools, without changing any setting, then run `capture-settings --state "<session.json>"` with the current creation session. This batches known settings tabs and restores the selected settings tab. Afterwards return to the original workspace using the observed native return control. It does not read protected password states or create missing business content. Versioned navigation aliases and sidebar labels live in `runtime/adapters/authoring-controls-26.1103.json`; changed aliases invalidate only their affected coverage observations, including before preview/export.

## User decisions, in order

1. **Form and language:** explain unified = one horizontal image in a shared scene; separate = independent main/sidebar images, optionally a split sidebar. Ask Chinese or English (and any additional installed Creator locale), preselected from the detected system language. Honor an existing choice. Present any needed coverage exclusions in this same round. `sidebarLayout` alone is not the whole-Skin form.
2. **Image source:** ask supplied images or generated images. If generated, collect environment, character/pose, composition and protected details together. Offer built-in GPT generation (default) or an actually configured MCP provider. Compose the complete prompt and per-slot sizes, save with `prompt`, show it, then record the user's explicit confirmation. Only then call the selected available image tool. Do not invent an MCP endpoint or silently switch providers. Show returned images; a requested resolution is not evidence of actual dimensions.
3. **Assets and background:** inspect each image once and supply a normalized protected-subject rectangle to `asset`; use explicit `null` only for scenery with no protected detail. The script checks real dimensions, applies orientation, computes an aspect-preserving crop and creates a sibling PNG. The main image must cover the complete maximized scene when sidebars close. Too-small images or impossible subject protection must be returned for replacement/recomposition, never silently stretched, enlarged, spliced or blurred. Show cropped results, apply `preview --stage background`, and ask for background acceptance.
4. **Controls:** only after background acceptance, ask theme-extracted colors or custom colors. Theme extraction shows four or five colors with real multiselect checkboxes through `palette-ui`; retrieve the submitted choice with `palette-read`. Do not select on the user's behalf. Apply the selected palette to requested surfaces with preserved foreground/semantic colors and contrast checks. `preview --stage complete` then asks for overall acceptance.
5. **Export:** record acceptance of the exact complete revision, then `export`. Never treat a CLI confirmation command as evidence that the user actually consented. The final folder contains only the validated manifest and referenced images. Report explicit exclusions and remaining real-client validation limits.

Only the prompt, background and complete-result acceptance gates are needed beyond the user's actual design choices. Displaying a crop does not introduce another mandatory confirmation. Changes invalidate dependent previews, not the entire conversation.

Honor explicit foreground and border requests through custom `colors` input (`style` and optional `regionStyles` in the command reference). Preserve the selected surface colors when text is explicit; a contrast conflict must be reported, not hidden by darkening the requested surface. Semantic content keeps native colors; do not apply a universal descendant text override.

## Boundaries and recovery

- `preview` reloads only the owned Skin layer and uses a temporary pack; `restore` restores the previous appearance without writing pack/preferences storage. An outdated runtime must be updated through the normal managed runtime path first. No forced app restart.
- If the client cannot expose its window through CDP, inventory uses the bundled Windows placement helper for the same verified process. It restores the saved placement on exit. Multiple ambiguous windows, identity changes and restoration failures stop the relevant step; do not substitute monitor resolution for the measured viewport.
- Read [the public experience guide](AI_Skills/Pitfall/ThingsShouldBeAvoided.md) for the relevant surface family. Distinguish decorative backplates, content surfaces and real controls; preserve input boundaries, focus, scroll occlusion, syntax/data colors and avatar layout. A transparent wrapper is not a recolored wrapper.
- Runtime v2 shared scenes are required by newly created Skins. Existing v1 Skins remain supported; preserve the bundled Kurumi Skin and its source images byte-for-byte. See [skin-format.md](references/skin-format.md).
- Keep generated prompts, reports, source paths, user choices and raw evidence private in the session. Do not include them in public packages. Read detailed files only for the active step; normally the small CLI summary is enough.
- Creator translations live in `locales/<locale>.json`; add a file to add a language, without source edits. Missing keys fall back to English. See [localization.md](references/localization.md). Normal/maximized placements are prepared during creation; a fixed window reuses them, and newly encountered sizes use a bounded cache.
- Finish all production/configuration writers before test preparation. Honor the project's separate exact-command test approval. Offline checks do not establish native visual acceptance. Real unified/separate creation trials are a separate user-directed validation stage.

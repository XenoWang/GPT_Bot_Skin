# Inventory through background acceptance

Read this module for new creation, geometry changes or image work. Use the command reference for the active command's JSON schema.

Start a new session with inventory by default:

```powershell
node scripts/creator.mjs start --session work/my-skin --state "<managed-session.json>" --id my-skin --name "My Skin"
```

Resolve the intended managed session through the package configuration or the user's compatible session. Do not guess a port, take over another client or force-close the app. Inventory visits mapped safe destinations and sidebar states, measures both normal/maximized geometry and restores placement. Display `catalog/index.html` or its numbered SVGs with the matching region table. Discuss unknown mappings, unsupported versions and required coverage gaps together. Backward compatibility needs separate adaptation.

Reuse confirmed choices. Otherwise ask unified/separate and language together, defaulting language from the detected system. Unified shares one horizontal image; separate uses independent main/sidebar art and may split the sidebar header/body. The main slot includes space revealed by closing sidebars. Only record exclusions the user actually chose; an unvisited state is not a pass.

Ask supplied images or generation. For generation, gather environment, composition, character poses and protected details together. Offer built-in GPT generation by default or an actually configured MCP provider. Save the complete per-slot prompt, show it and record explicit confirmation before generation. A user-directed edit supplies its own change instruction; do not re-ask unchanged creative choices. Show the returned images and inspect their real dimensions.

Inspect each selected image and pass a normalized protected-subject rectangle to `asset`; use explicit `null` only when nothing needs protection. Preserve originals. The codec applies orientation, computes an aspect-preserving crop and writes a sibling PNG. Too-small images and impossible protected crops require replacement/recomposition unless the user explicitly authorized a limited exception. Keep that exception and actual processing in the private session.

Show the processed assets, apply `preview --stage background`, and ask for background acceptance. Showing a crop is not a separate mandatory approval gate. Scope-only updates with identical background manifests can retain the user's actual visual acceptance; never claim changed art was accepted.

When revising art after controls already exist, explain that a background-only preview temporarily omits control styling. After genuine background acceptance, promptly reapply the retained complete palette before further refinement. Do not misreport this phase switch as lost configuration. For character-proportion corrections, use a trustworthy visual reference and preserve the whole figure's aspect ratio; opposite adjectives such as wider/taller can cause repeated overcorrection. Preserve intentional depth and detail rather than adding unrequested blur.

## Remaining native states

Use permitted UI tools to open an available native state, then `capture --slot ...`. Do not manufacture content to complete the catalog. For ordinary Settings, open it once, leave search/edit focus without changing its value, and use `capture-settings`. The batch restores its selected tab; then return to the original workspace and verify it. A zero exit or a selected built-in navigation item alone does not prove the original conversation was restored.

Profile is a standalone native page: open it through UI, then `capture --slot settings-profile`. Protected password settings are excluded from ordinary capture/navigation. Only after explicit authorization may `capture-shell --slot settings-passwords --note ...` read the two outer layout containers. Do not take screenshots, read entries/credentials, expand items or change settings on that page. Keep `shellOnlyStates` visible as a limitation. External content remains excluded from automatic navigation.

Versioned navigation aliases, surface selectors and sidebar labels live in `runtime/adapters/authoring-controls-<profile>.json`. `runtime/adapters/versions.json` maps complete client versions to separate profiles; unknown versions cannot navigate or inject a guessed adapter. Changed mappings invalidate affected observations, and a client upgrade requires a fresh inventory. Keep existing source art and creative choices for reuse, but do not copy old coverage or visual acceptance onto changed geometry. On a recurring navigation or geometry failure, use the recovery module before reconstructing a manual workaround.

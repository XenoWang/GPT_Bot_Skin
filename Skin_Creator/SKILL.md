---
name: codex-skin-creator
description: Create unified or separate-image Codex Desktop Skins through measured UI inventory, protected image cropping, staged native previews and data-only export. Use for Skin authoring or version-specific native surface adaptation, not ordinary wallpaper generation or daily Skin switching.
---

# Codex Skin creator

Run `node scripts/creator.mjs <command> --session work/<draft> --format brief` from this package. Resume with `status`; use full output only when the missing detail matters. Private sessions stay in ignored `work/`. Runtime is bundled; no sibling package is required. `Create-Skin.py` adds the Python route without replacing the existing launcher; read [README](README.md) only for setup.

## Load the current stage only

- New creation, geometry or artwork: [creation-flow](references/creation-flow.md).
- Accepted background, controls or export: [control-adaptation](references/control-adaptation.md).
- Actual failure or recurring visual defect: [recovery](references/recovery.md), then query the symptom. Do not preload its catalog or local history.
- Exact arguments: the relevant section of [commands](references/authoring-cli.md), not the entire reference.
- Explicit Skill maintenance/efficiency work only: [maintenance](references/maintenance.md).

Never preload every stage. Scripts calculate dimensions, crop, validate colors, track revisions and export; the model makes visual decisions once and reuses saved decisions.

## Boundaries

1. Follow inventory → form/language → supplied/generated artwork → protected assets → background acceptance → controls → complete acceptance → export. Show the numbered inventory diagram and matching regions. Reuse genuine user decisions; changed artifacts invalidate only dependent acceptance. A confirmation command cannot create consent.
2. Unified uses one shared landscape; separate uses independent main/sidebar images, optionally a sidebar header. Main art covers the measured maximized canvas with the sidebar closed. Also measure the usual normal size. Never substitute monitor resolution or constantly recalculate a fixed layout.
3. Inspect actual generated dimensions. Default: reject small images and impossible protected crops; no stretching, blur-fill or silent enlargement. Keep originals; a user-approved exception is theme-specific.
4. Coverage does not mean every surface needs color. Keep unnecessary backgrounds transparent/native; preserve semantic colors. Check actual inner backplates and neutral foreground contrast. Decorations must not alter native hits, focus or dragging.
5. Do not create chats, upload attachments or trigger business actions just to manufacture coverage. Prefer exact profiles, then reuse the configured minimum profile for later versions. Collect coverage on the actual client and window before accepting or exporting. Protected settings require explicit outer-shell authorization and `capture-shell`; never inspect their contents.
6. Preserve existing Skins, personal settings and window/workspace state. Consult only the relevant [experience-guide](AI_Skills/Pitfall/ThingsShouldBeAvoided.md) section. Report failed restoration and unverified compatibility honestly.
7. Languages are configuration in `locales/`, with English fallback. New exported features require a compatible runtime; old v1 Skins remain supported. Production changes and tests follow the project's approval workflow; offline tests do not establish native visual acceptance.

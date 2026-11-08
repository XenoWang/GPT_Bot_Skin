# Skin formats v1 and v2

Existing v1 packs and their preferences remain supported without rewriting them. Creator now emits v2 for precomputed shared scenes; older runtimes reject v2 and must be updated. This is format support, not backward compatibility with older Codex client versions.

## v2 shared scenes

The v1 fields below remain valid. v2 adds a strict top-level `scene` object:

```json
{"scope":"window","regions":["titlebar","navigation","sidebar","chat"],"background":{"asset":"assets/scene.png","blackOverlay":0.35,"subject":[0.4,0.1,0.7,0.9],"fit":"subject-safe","maxScale":1,"blurFill":false},"placements":[]}
```

`scope:window` is the whole-Skin unified form; `scope:main` anchors a separate main panorama outside the fixed navigation rail. Participating regions must be enabled and cannot paint a second image/gradient/surface. Main scope can coexist with an independently configured sidebar. `chatLayout` and `scene` cannot coexist. Shared participants are titlebar, navigation, sidebar, chatHeader, chat, rightPanel, bottomPanel, tabs and pageHeaders; content cards and popups use readable themed surfaces instead.

Creator measures the usual windowed and maximized layouts and saves `placements` (up to eight), each with `viewport:[w,h]`, `pixelRatio`, `frame:[x,y,w,h]`, `source:[pixelWidth,pixelHeight]` and `image:[x,y,w,h]` relative to the frame. The validator checks these against the subject-preserving geometry. Runtime selects a matching placement directly; a new size is computed once and retained in an eight-entry cache. Sidebar movement changes region offsets, not the scene crop. No continual resizing/re-cropping occurs for a fixed window. Unfillable protected subjects are reported, not silently cut or enlarged.

Scene overlay is exposed as a dynamic opacity control and remains per Skin. Existing sidebar controls, v1 layout behavior, translation selection and opacity preferences are unchanged. Imported packs still contain only data and local images; no authoring prompts, runtime state, paths or code are exported.

## v1 fields, also available in v2

`manifest.json` is a UTF-8 object with `schemaVersion:1`, unique lowercase `id` (a-z, 0-9, hyphen; up to64; not original), nonempty `name` (up to80), optional description (up to500), and `regions`.

Supported regions: titlebar, navigation, sidebar, sidebarRows, chatHeader, chat, userMessages, assistantMessages, toolCards, changeSummary, composer, attachments, codeBlocks, tables, rightPanel, bottomPanel, tabs, menus, dialogs, settings, pageHeaders, pageCards, questions, profileActivity, buttons, inputs, tooltips, scrollbars.

Each region uses `enabled` plus optional `style`, `background`, `gradient`, `ornament`. Omitted fields retain native behavior. The engine validates an allowlist; packs cannot supply selectors, CSS, scripts or external URLs.

- `style`: surface/text/border are #RRGGBB; surfaceOpacity/borderOpacity 0..1 (require the matching color); borderWidth0..8; radius/padding/gap0..64; fontSize10..48; lineHeight1..3; fontFamily plain safe names; shadow none/soft/deep. Retain native text unless explicitly requested.
- `background`: asset `assets/name.png|jpg|jpeg|webp`; blackOverlay0..1; subject `[left,top,right,bottom]` normalized valid bounds; fit subject-safe/contain/cover/cover-top; maxScale0.1..1 normally; blurFill boolean; cropTop allowed only for cover-top and cannot exceed subject top. Overlay is separate from image pixels.
- `gradient`: angle−360..360, 2..6 ordered stops `{color,at}` (at0..1), optional opacity0..1. Its alpha affects color stops only. If opacity omitted and style.surface exists, style.surfaceOpacity supplies the effective alpha; don't double-paint a solid root.
- `ornament`: pattern image, asset local image, orientation vertical/horizontal, opacity0..1, optional scale0.5..2. Legacy rose-vines also supports color/accent; generated bitmap art is appropriate for detailed botanical styles. Background image cannot be combined with gradient/ornament in the same region.
- `hover`: surface #RRGGBB and surfaceOpacity0..1.
- `sidebarLayout`: mode merged/split; header image config; optional body image config; divider `{color,opacity,width,inset}`. Header follows visible native geometry, not hardcoded height. If absent, split is unavailable.
- `chatLayout:{"mode":"panorama"}`: one complete image across full scene. The chat background maxScale may be up to2; avoid needless upscaling. Builtin uses1.2 because actual generated resolution is smaller than the maximum rendered scene. Legacy left-extension mode remains readable for older imports; do not use that seam-prone approach for new stable scenes.

Import limits: one folder, at most100 files and48 MiB total; manifest128 KiB; individual image20 MiB. Keep required images within assets, without traversal or symlinks escaping the pack. Unsupported fields are rejected. Runtime also checks image decoding/dimensions and decoded pixel budget; inspect the current validator before designing unusually large assets.

Opacity controls are derived from enabled fields including default-alpha backgrounds, borders, images, gradients, ornaments, hover and sidebar divider. Do not maintain a separate fixed control list. Overrides must pass validation, clone the manifest, persist per Skin and restore cleanly. The bundled `runtime/renderer/core.mjs` is the executable schema authority.

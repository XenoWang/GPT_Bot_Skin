# Add a translation file

Place one UTF-8 JSON file in `runtime/locales/` (creator: locate the usage engine's locales directory). Copy `en.json`, rename to `<locale>.json`, update `locale` and `name`, then translate values. `name` is the language's own readable name. `direction` may be `ltr` or `rtl`. `menuLabels` contains the native app's translated File-menu label, used only when the app doesn't publish a document language.

```json
{
  "locale": "fr",
  "name": "Français",
  "direction": "ltr",
  "menuLabels": ["Fichier"],
  "strings": {"title": "Réglages Skin", "launcher": "Skin"},
  "regions": {},
  "skins": {}
}
```

English is the complete base. Other files may be partial: missing keys fallback to English. Keep `{count}`, `{label}`, `{version}`, `{error}`, `{name}`, `{path}` placeholders unchanged where the English source uses them. Keys must match supported strings/regions; never include scripts or markup. Filename must exactly equal locale + `.json`; no duplicate locales, symlink escape or prototype keys. Maximum 64 files, 128 KiB each.

Rebuild with `node runtime/scripts/build-cdp-payload.mjs` (or `node scripts/build-cdp-payload.mjs` inside runtime), then restart only the owned companion or restart the official app normally. This is a build, not proof of native acceptance. The new language appears without editing renderer code. Auto follows GPT document language or the observed native File menu, never the system language. Unsupported languages use English. Manual selection is independent of the per-Skin opacity values.

All bundled manager labels, statuses and errors use these files. Arbitrary native operating-system error messages may remain in their original language. English UI uses **Skin**. A future RTL translation still requires native geometry/visual verification; the supplied languages are LTR.

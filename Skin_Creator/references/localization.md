# Add a translation file

## Creator interface / 创作界面

Creator 的翻译文件位于 `Skin_Creator/locales/`，与 Usage 的运行面板翻译分开。复制 `en.json` 为 `<locale>.json`，修改 `locale`、`name`、可选 `direction`，翻译 `messages`、`regions` 和 `errors`。不需要修改脚本。所有语言会出现在 CLI 返回的语言选项中；系统语言有对应配置时预选该语言，否则回退英文。仅覆盖部分键也可以，缺失键回退英文。

Creator translations are separate from Usage runtime translations. Copy `Skin_Creator/locales/en.json` to `<locale>.json`, change `locale`, `name` and optional `direction`, then translate `messages`, `regions` and `errors`. No source edit is needed. Installed locales are discovered automatically, with English fallback.

`messages` 使用稳定键；保持 `{detail}` 等占位符。`errors` 支持精确文本键及以 `*` 结尾的前缀键，前缀后的技术细节用 `{detail}` 插入；`*` 是未匹配错误的回退模板。命令、JSON 字段、状态码和素材槽 ID 是机器合同，不翻译。文件名必须与 locale 一致；禁止越界符号链接、原型键；每份 128 KiB、最多 64 份。图表与预览通过转义或 textContent 显示文案，不执行配置内容。

Keep placeholders in message translations. Error maps support exact keys, prefix keys ending in `*` with `{detail}`, and a `*` fallback. Commands, JSON keys, status codes and slot IDs remain stable. Locale files must match their identity and pass size/path checks; text is never executed. Restart the next Creator command to discover newly added locale files. An existing session keeps its chosen language until explicitly changed.

## Usage runtime panel / 使用面板

Creator asks Chinese/English once, preselected from the system locale, and stores that explicit choice in the private creation session. Temporary previews use it without changing persistent preferences. The regular Usage panel retains its existing auto-follow-app option and independently selectable language; creating a Skin does not change the OS or Codex language.

Place one UTF-8 JSON file in `runtime/locales/`. Copy `en.json`, rename to `<locale>.json`, update `locale` and `name`, then translate values. `name` is the language's own readable name. `direction` may be `ltr` or `rtl`. `menuLabels` contains the native app's translated File-menu label, used only when the app doesn't publish a document language.

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

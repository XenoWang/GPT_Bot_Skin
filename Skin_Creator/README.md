# Codex Skin Creator

新增 Python 入口；原 Node／PowerShell 入口保留：

```text
python Skin_Creator/Create-Skin.py --help
python Skin_Creator/Create-Skin.py start --session Skin_Creator/work/my-skin --state "<Python链路的session.json>" --id my-skin --name "My Skin"
```

Python 入口透传相同创作命令，并选用不依赖 PowerShell 的身份核验、系统语言和 Windows 图片后端。需要 Python 3.10+、Node.js 22+、相邻 Engine 和由 Usage Python 入口建立的受管会话；不会自动替换旧会话或启动客户端。入口文案也来自 `locales/`。PNG/JPEG 可直接处理；其他格式以系统解码能力为准，不自动安装解码器。

An additional `Create-Skin.py` entrypoint forwards the same authoring commands and selects the Python host/image backend. Existing Node/PowerShell entrypoints remain unchanged. Requires Python 3.10+, Node 22+, sibling Engine, and a managed session established by the Usage Python route. It does not start the client, replace legacy sessions, install codecs, or bypass application execution restrictions. Entrypoint messages also use the locale files.

[中文](#中文) · [English](#english)

## 中文

创建一体式或分开式 Skin。先运行 [SKILL.md](SKILL.md) 的盘点入口，再选择形式、语言和素材来源；确认背景效果后才处理气泡、输入框、菜单和弹窗，整体确认后导出。

**一体式**使用一张横图和共享场景坐标；**分开式**使用完整横向主图及按需求提供的独立侧栏图。侧栏内部是否再分段是另一个选项。主图尺寸按最大化且侧栏收起后的完整场景计算，避免后续补景拼接。

脚本负责可用入口自动盘点、覆盖记录、编号图表、图片尺寸检查与主体保护裁剪、提色、配色、会话续做和导出。未知页面或不能安全触发的弹窗保留缺口；不会伪报全区域完成。现有图片、内置狂三皮肤和个人偏好不会被创作预览覆盖。

运行需要 Node.js 22+、Windows PowerShell、相邻的 `Skin_Engine/` 与已配置的受管客户端。图片处理使用 Windows 自带图像解码器；PNG/JPEG 可作为通用输入，WebP 需本机可用的兼容解码器，缺失时明确报错。无自动依赖安装。生图使用当前环境可用的内置 GPT 工具，或用户选择并配置的 MCP；提示词先确认。

从项目根开始：

```powershell
node Skin_Creator/scripts/creator.mjs start --session Skin_Creator/work/my-skin --state "<managed-session.json>" --id my-skin --name "My Skin"
```

命令、JSON 输入及续做方式见[创作命令参考](references/authoring-cli.md)。`Inspect-UI.ps1` 仍是单次只读诊断入口；新创作默认使用包含覆盖编排的 `start`。图表和所有私有状态保存在被忽略的会话目录。

新创作输出主题格式 v2，需要更新后的 Engine/Usage；旧 v1 狂三等主题不修改。客户端版本仍需匹配适配器，不承诺向下兼容。离线测试与真实创作验收分别记录。

Creator 自身的中文/英文文案在 `locales/zh-CN.json` 和 `locales/en.json`。协作者复制英文配置、修改语言标识与翻译即可添加语言，无需改源码；缺失内容回退英文。窗口化及最大化定位在创作时预计算，固定窗口复用；新尺寸才补算一次并缓存。

## English

Create unified or separate-image Skins using [SKILL.md](SKILL.md). Inventory first, choose the form/language and image source, approve the background preview, then style controls and approve the complete result before export.

A unified Skin uses one landscape image in shared window coordinates. A separate Skin uses a complete maximized main scene plus independent sidebar assets; splitting the sidebar internally is a separate choice. Scripts handle safe mapped navigation, explicit coverage gaps, numbered geometry diagrams, image size/crop constraints, palettes, resumable state and data-only export. Native previews do not overwrite installed Skins or personal preferences.

Requires Node 22+, Windows PowerShell, sibling `Skin_Engine/` and a configured managed client. Image processing uses the installed Windows decoder: PNG/JPEG are the portable choices; WebP needs a compatible installed decoder. No dependency is installed automatically. Generation uses the available built-in GPT tool or the user's configured MCP provider, only after prompt approval.

Run the command above from the project root; see [the CLI reference](references/authoring-cli.md). `Inspect-UI.ps1` remains a single-capture diagnostic, while `start` orchestrates creation inventory. New output uses Skin format v2 and needs the updated runtime. Existing v1 Skins are preserved. Unsupported client versions require adaptation; offline checks are not native visual acceptance.

Creator's own translations live in `locales/`. Copy `en.json`, change its locale identity and translate it to add a language without source changes. Missing keys fall back to English. Normal/maximized placements are precomputed during creation; fixed windows reuse them, and new sizes are calculated once and cached.

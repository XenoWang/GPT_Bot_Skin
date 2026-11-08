# Codex Skin

[中文](#中文) · [English](#english)

## 中文

Windows Codex Desktop 外观工具，提供独立主题文件夹、透明度设置和多语言界面。

另提供附加 Python 启动入口：[Creator](Skin_Creator/Create-Skin.py) 与 [Usage](Skin_Usage/Start-Skin.py)。原 CMD／PowerShell 方案保留；新链路不调用 PowerShell，仍需系统允许运行 Python、Node 和官方客户端。具体命令及独立配置说明见各目录 README。

| 目录 | 用途 |
|---|---|
| [Skin_Usage](Skin_Usage/README.md) | 使用技能、启动脚本与附赠主题 |
| [Skin_Creator](Skin_Creator/README.md) | 创作技能、区域盘点、模板和经验指南 |
| [Skin_Engine](Skin_Engine/README.md) | 渲染器、版本适配器、构建与测试 |

### 版本兼容

**不提供向下版本兼容。** 当前适配版本以适配器文件为准；更旧客户端不能直接视为受支持版本，新版本也需要检查。安装技能与原生界面成功加载是两个步骤。

需要适配旧版本时，可以让 Codex 在目标客户端运行区域盘点脚本，按报告调整适配器并验证。脚本是诊断工具，不是“一键兼容”补丁，不会自动修改界面或放宽连接校验。

### 创作前默认盘点

新创作入口为 `Skin_Creator/scripts/creator.mjs start`，流程为盘点及编号图 → 一体式/分开式与语言 → 用户给图或确认提示词后生成 → 保护主体裁剪 → 背景预览确认 → 多选配色与控件适配 → 整体确认导出。常用窗口化/最大化尺寸预先计算并保存，固定尺寸复用。详见 [Creator](Skin_Creator/README.md)。下面的单次 Inspect-UI 入口继续作为诊断工具。

`Skin_Creator` 制作 Skin 前必须先盘点。三个目录都提供 `Inspect-UI.ps1` 入口：

```powershell
powershell.exe -NoProfile -File .\Skin_Creator\Inspect-UI.ps1 -Label new-chat
powershell.exe -NoProfile -File .\Skin_Engine\Inspect-UI.ps1 -Label settings-general
powershell.exe -NoProfile -File .\Skin_Usage\Inspect-UI.ps1 -Label drawer-open
```

先通过使用包配置并启动受管客户端。入口读取可用运行配置；需要时显式传入 `-StatePath "<session.json的位置>"`。默认在调用目录的 `work/ui-inventory/` 输出本地结构报告及 `.regions.json` 可配置区域清单，这些输出被忽略，不随仓库发布。

脚本遍历已加载的模块及开放的 Shadow DOM，记录区域命中、可见性、边界和背景样式，不读取正文、密码、输入值、Cookie或账号资料。未打开的页面与懒加载弹窗不会凭空出现：Codex需使用界面工具逐页打开页面、侧栏、设置类别和弹窗，分别采集并核对覆盖清单。没有观察到的区域不能标成不存在。

Codex应先给一张按实际布局绘制的编号简易图，再用同编号表格展示“已确认可配置／需要适配／尚未检查”的区域及可选能力，再按用户选定范围制作。已有明确范围可直接沿用。新发现但未映射的模块必须先适配，不能直接写入主题清单。详见[盘点与适配流程](Skin_Creator/references/ui-inventory.md)。

可直接给 Codex：

```text
请先读取 Skin_Creator/SKILL.md。在目标客户端逐页盘点区域，运行 Inspect-UI.ps1 采集必要状态并合并报告。先给我可配置区域、待适配区域和未检查范围，再按我选定的范围制作皮肤。如果是旧版本，先调整适配器并验证，不要假定它已兼容。
```

### 开发与隐私

从仓库根运行离线回归：
```powershell
python -X utf8 -m unittest discover -s Skin_Engine/tests -p test_*.py -v
```

公开资料使用相对路径。测试结果、运行状态、个人配置和历史日志保留本地并被忽略；可选索引见 [LOCAL_CONTEXT.md](LOCAL_CONTEXT.md)。忽略规则不会清除已提交历史，也不能阻止手工打包私人文件。

## English

Additional Python entrypoints are available in [Creator](Skin_Creator/Create-Skin.py) and [Usage](Skin_Usage/Start-Skin.py). The existing CMD/PowerShell route is retained. The new route avoids PowerShell internally but still needs Python, Node and the official client to be allowed by OS policy. See each package README for commands and separate configuration.

For new creation, use `Skin_Creator/scripts/creator.mjs start`: inventory/numbered diagrams, unified/separate form and language, supplied or prompt-approved generated images, protected cropping, background acceptance, multiselect colors/control styling, final acceptance and export. Usual windowed/maximized placements are precomputed. See [Creator](Skin_Creator/README.md); the single-capture inventory commands remain diagnostic tools.

A local appearance toolkit for Windows Codex Desktop with folder-based Skins, opacity controls and translations. **Backward compatibility is not supported.** Consult the packaged adapter version; older clients are not supported by assumption, and newer clients also need inspection.

For an older client, ask Codex to run the UI inventory, adapt the selectors and layout behavior, and verify the result. The scanner is diagnostic: it does not automatically patch the app, guarantee compatibility or weaken connection checks.

Before creating a Skin, **Skin_Creator must inventory the target UI first**. Each of the three folders provides `Inspect-UI.ps1`; the commands above work from the repository root. Configure and start the managed client first. Supply `-StatePath "<path-to-session.json>"` when necessary. Each capture produces a local report and a `.regions.json` configurable-region catalog under the calling folder's ignored `work/ui-inventory/`.

The scanner traverses loaded modules and open shadow roots, recording selector matches, visibility, geometry and background styles. It does not read messages, passwords, input values, cookies or account content. Codex must navigate relevant pages, Settings categories, drawers, dialogs and states through UI tools, then capture them separately. Unopened or lazy-loaded regions remain **not observed**, not absent.

Present a small numbered layout diagram and a matching table of confirmed configurable regions, adaptation needs and uninspected coverage before authoring. Reuse an already explicit selection; otherwise obtain the user's choice. New unmapped modules need adapter work before they can appear in a Skin manifest. See the [inventory workflow](Skin_Creator/references/ui-inventory.md).

```text
Read Skin_Creator/SKILL.md first. Inventory the target client's pages and states with Inspect-UI.ps1 and merge the reports. Show configurable regions, adaptation needs and uninspected coverage before creating my Skin. For an older client, adapt and verify first; do not assume compatibility.
```

Run offline regression with the command above. Private results, configuration and session data are ignored and indexed locally. Review actual staged/release files before publishing; ignore rules do not remove committed history or sanitize a manually created archive.

# Codex Skin Creator

[中文](#中文) · [English](#english)

## 中文

这是可单独发布的创作包。区域盘点、配置校验、临时预览、图片处理及启动服务均在本目录内，无需下载同级的其他包。入口：[SKILL.md](SKILL.md)。

创作流程：盘点及编号图 → 一体式/分开式与语言 → 给图或确认提示词后生成 → 主体保护裁剪 → 背景预览确认 → 配色多选及控件适配 → 整体确认后导出。已有选择可续用，常用窗口化/最大化定位预计算，固定尺寸复用，新尺寸补算一次并缓存。

盘点支持受管原生窗口测量与恢复：客户端不支持 CDP 窗口接口时按已校验进程定位窗口，目标有歧义则停止。自定义控件颜色支持显式文字、边框及宽度，浅色底配黑字时保持所选底色；对比不足明确报错。代码和状态语义色保留，具体字段见创作参考。

### 从本包启动

需要 Windows、Node.js 22+。可选 Python 3.10+ 链路，内部不调用 PowerShell。以下命令在解压后的 Creator 目录执行：

```text
python Start-Skin.py --help
python Start-Skin.py configure --proxy-mode direct
python Start-Skin.py
```

上面是直连示例；使用本机 HTTP 代理时，以 `configure --proxy-mode proxy --proxy-server 127.0.0.1:7897` 配置自己的地址。默认 Python 会话位于用户本地应用数据目录的 `CodexSkinCreatorPython/session.json`；实际位置以启动输出为准。

保留原 PowerShell/CMD 链路：`Configure-Skin.cmd`、`Start-Skin.cmd`、`Restore-Skin.cmd`；默认会话目录为 `CodexSkinCreator`。已有其他受管会话时，可在相同后端链路中显式传入其 session 文件，避免重复启动助手。普通客户端正在运行时先保存输入并正常退出；不会强制关闭、改变系统代理或绕过执行限制。

### 开始创作

```text
python Create-Skin.py start --session work/my-skin --state "<受管会话的session.json>" --id my-skin --name "My Skin"
```

原 Node 入口 `node scripts/creator.mjs` 与 `Create-Skin.ps1` 保留。详细命令见[创作参考](references/authoring-cli.md)。`Inspect-UI.ps1` 用于单次结构诊断，创作默认用 `start` 完成覆盖编排。受保护、未访问、未映射的状态明确列为缺口。

一体式使用一张完整横图与共享场景坐标；分开式使用完整主图和独立侧栏图，侧栏可进一步分段。主图按最大化且侧栏收起后的完整场景测量。图片尺寸不足或裁剪会伤及受保护细节时返回冲突，不偷偷放大、拼条或模糊补边。PNG/JPEG 可用，其他格式取决于本机解码器。生成提示词先确认，再调用已选的可用 GPT/MCP 工具。

`locales/en.json` 和 `locales/zh-CN.json` 是 Creator 文案配置；复制并翻译配置即可添加语言，缺键回退英文。运行面板翻译另在 `runtime/locales/`。参见[翻译说明](references/localization.md)。现有主题、动态透明度、侧栏布局和语言偏好保留。

### 自行打包

```text
python Build-Zip.py --output ../Skin_Creator.zip
```

只打包 `release-manifest.json` 中的已审阅文件。工作目录、个人配置、缓存、日志和开发测试不进入 ZIP；公开经验指南会保留。不要直接无筛选压缩整个已使用目录。新增语言或维护代码后，需审阅并更新发布清单。创建主题的数据包使用 `export`，不使用此技能打包命令。

## English

A standalone authoring package: inventory, validation, previews, image processing and managed launch services are bundled locally. No sibling package is required. Start with [SKILL.md](SKILL.md).

Requires Windows and Node 22+. The optional Python 3.10+ route does not invoke PowerShell internally. Run the commands above from the extracted Creator folder; choose direct or your own local HTTP proxy. Python and PowerShell routes default to separate `CodexSkinCreatorPython` and `CodexSkinCreator` state folders in local application data. Use the session path reported by the launcher. Reuse an explicitly selected compatible managed session instead of launching a second assistant. The original CMD/PowerShell entrypoints remain available.

Authoring proceeds from measured diagrams through form/language, image source, approved generation prompts, protected crops, background acceptance, multiselect colors, complete acceptance and data-only export. Unvisited/unsupported states remain explicit gaps. Normal/maximized placements are precomputed; fixed sizes reuse them. Existing Skins and their configurable preferences are preserved.

Inventory falls back to verified native Windows placement when the CDP window interface is unavailable, and restores the original placement. Ambiguous windows and identity failures stop the operation. Custom control colors support explicit foregrounds, border colors and widths; requested surfaces are retained or rejected for contrast, while semantic foregrounds remain native.

Creator translations live in `locales/`; add a locale JSON file without changing source. Runtime panel translations are in `runtime/locales/`. PNG/JPEG are the portable image inputs; other formats depend on installed codecs. No automatic dependency installation or policy bypass occurs.

Use `Build-Zip.py` to package the reviewed file allowlist, excluding private state and development artifacts. Update the release manifest only after reviewing intentional changes. This builds the Skill ZIP, not the data-only Skin exported by the authoring workflow.

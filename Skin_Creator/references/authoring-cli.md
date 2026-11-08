# 创作命令 / Authoring commands

所有命令从项目根运行，使用 `node Skin_Creator/scripts/creator.mjs <command> --session Skin_Creator/work/<draft>`。也可用 `Create-Skin.ps1` 包装入口。CLI 摘要供代理读取；面向用户展示编号图、图片和自然语言选择，不让用户理解内部键。状态写入采用锁及原子替换；中断后继续同一会话，不删除原证据。

All commands share the prefix above. The CLI returns concise agent-facing summaries. Show users the generated diagram, images and readable choices. Sessions use a lock and atomic replacement; resume the same folder rather than discarding evidence.

| 命令 / Command | 输入与作用 / Input and effect |
|---|---|
| `start --state "<session.json>" --id my-skin --name "My Skin"` | 默认运行受管盘点，输出图表及缺口 / Starts inventory by default |
| `inventory --state "..."` | 重新测量；同目标与布局可复用已完成状态 / Resumes matching coverage |
| `capture --state "..." --slot menus` | UI 工具打开缺口状态后采集，必须满足结构证据 / Captures an actually opened missing state |
| `status` | 只显示当前阶段摘要、尺寸与缺口 / Shows summary, dimensions and gaps |
| `select --input "<choices.json>"` | 保存形式、语言及区域范围 / Saves form, language and scope |
| `source --input "<source.json>"` | 用户给图或生成 / Supplied or generated images |
| `prompt --input "<prompt.json>"` | 保存待确认提示词，输出生成请求与精确素材槽 / Records the prompt and required slots |
| `confirm --stage prompt --revision "<hash>" --note "<actual user response>"` | 仅在用户已确认后记录 / Records actual confirmation, never creates consent |
| `asset --slot scene --input "<image.png>" --subject "[0.1,0.1,0.7,0.9]"` | 实测、定向、保护主体裁剪；无主体明确传 `null` / Measures and crops with an explicit ROI |
| `background` | 生成背景清单供审阅 / Builds the background manifest |
| `preview --state "..." --stage background` | 临时热预览，返回确认版本 / Applies a temporary preview |
| `confirm --stage background --revision "<hash>" --note "..."` | 背景确认 / Background acceptance |
| `colors` | 提供 4–5 个颜色候选 / Offers palette candidates |
| `palette-ui --state "..."` | 显示原生多选色卡 / Displays real multiselect color checkboxes |
| `palette-read --state "..."` | 读取用户提交的色卡 / Reads the user's submitted choices |
| `colors --input "<colors.json>"` | 记录自定义或用户明确指定的多选颜色 / Records explicit custom or theme choices |
| `preview --state "..." --stage complete` | 适配控件后整体预览 / Previews the complete Skin |
| `confirm --stage complete --revision "<hash>" --note "..."` | 整体验收 / Complete acceptance |
| `export --output "<new-folder>"` | 导出当前已确认版本；拒绝覆盖 / Exports the accepted revision without overwriting |
| `restore --state "..."` | 恢复预览前皮肤 / Restores the previous appearance |

`--target` 可选，用于多个原生窗口无法自动唯一定位时。缺少受管会话、旧运行时或未知客户端版本会停止相关步骤，不放宽来源校验。窗口最大化和导航会在盘点结束后恢复；无法恢复会留下阻塞。仅打开安全入口，不提交业务操作。导航选中状态、边界及颜色属于采集内容；正文、输入值和凭据不是。

Use `--target` only when multiple native windows cannot be disambiguated. Missing managed sessions, old runtimes and unknown client versions block dependent steps. Inventory restores window/navigation state and records restoration failures. It never submits business actions or reads messages, input values or credentials.

## 最小输入 / Minimal inputs

`choices.json`：
```json
{"mode":"unified","language":"zh-CN","regions":["titlebar","navigation","sidebar","chat"]}
```
`mode` 可为 `separate`；`sidebarSplit:true` 额外需要已实测的侧栏头部及主体素材。省略 regions 时默认选已观察且无适配问题的区域。所有相关状态缺口仍需补齐；用户明确缩小范围时，增加 `excludedStates:[...]` 和非空 `exclusionReason`，交付报告会保留排除项。不要默认排除缺口。

Mode may be `separate`; `sidebarSplit:true` additionally requires measured sidebar header/body assets. Omitted regions default to observed, adapter-ready regions. Related state gaps still block preview/export unless the user explicitly excludes them using `excludedStates` and `exclusionReason`.

`source.json`：
```json
{"kind":"provided"}
```
或 / or：
```json
{"kind":"generated","provider":"gpt"}
```
MCP 使用 `{"kind":"generated","provider":"mcp","providerName":"<configured tool>"}`。脚本不持有密钥，也不自动发起生图；代理在提示词确认后调用用户选择的可用工具，再把实际返回图片交给 `asset`。不得把生成请求尺寸当作真实输出。

`prompt.json`：
```json
{"prompt":"完整画面需求、人物与姿态、构图、关键细节、各素材槽的一致性要求。"}
```
提示词应展示给用户，包含返回的 slots、目标尺寸和生成供应方。内容调整后旧确认失效。给图流程没有提示词确认步骤。

`colors.json`：
```json
{"mode":"custom","colors":["#391527","#B67153"]}
```
`theme` 模式只能使用脚本给出的候选；允许多选。根据实测前景色为表面选择可读底色，默认不透明底色，避免照片变化破坏对比度。前景采样为有限结构样本，不宣称穷尽全部文字；真实效果仍需用户验收。混合前景无法满足约束时返回冲突，而不改变正文颜色。

Theme mode accepts the displayed candidates; multiple choices are supported. Surface colors are derived from measured foreground samples using opaque backgrounds to avoid photo-dependent contrast. Samples are finite, not proof of every text node. Conflicting foreground colors require separate adapter mapping, not silent text recoloring.

## 图片与交付 / Assets and export

缩放比例为 `max(targetWidth/sourceWidth,targetHeight/sourceHeight)`；不得大于 1。裁剪窗口必须完整包含保护框。输入 EXIF 方向先归一，保护框应以用户看到的正常方向定义。输入采用本机 Windows 解码器；PNG/JPEG 是通用输入，WebP 缺少解码器时报错。每张图 20 MiB、解码 6400 万像素、最终包 48 MiB 的限制仍有效。建议针对目标尺寸导出清晰素材，不先生成超大原图再超限提交。

Output is an oriented, subject-preserving PNG. Both source dimensions must meet the measured target. Crop windows must contain the entire ROI. Input decoding depends on Windows; unsupported WebP is rejected. Existing image/pixel/pack limits still apply.

最终包只含清单及引用图；不会带入提示词、原图路径、会话、截图或报告。新清单使用 v2，共享窗口场景或完整主区场景；旧运行时会拒绝它，须先更新运行包。原有 v1 狂三皮肤及其偏好继续使用。

Export includes only the manifest and referenced images. Prompts, paths, sessions and reports stay private. New v2 packs require the updated runtime; existing v1 Kurumi Skins/preferences remain supported.

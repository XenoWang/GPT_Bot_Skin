# 创作命令 / Authoring commands

所有命令从解压后的 Creator 包目录运行，使用 `node scripts/creator.mjs <command> --session work/<draft>`。也可用 `Create-Skin.ps1` 包装入口。CLI 摘要供代理读取；面向用户展示编号图、图片和自然语言选择，不让用户理解内部键。状态写入采用锁及原子替换；中断后继续同一会话，不删除原证据。

All commands share the prefix above. The CLI returns concise agent-facing summaries. Show users the generated diagram, images and readable choices. Sessions use a lock and atomic replacement; resume the same folder rather than discarding evidence.

| 命令 / Command | 输入与作用 / Input and effect |
|---|---|
| `start --state "<session.json>" --id my-skin --name "My Skin"` | 默认运行受管盘点，输出图表及缺口 / Starts inventory by default |
| `inventory --state "..."` | 重新测量；同目标与布局可复用已完成状态 / Resumes matching coverage |
| `capture --state "..." --slot menus` | UI 工具打开缺口状态后采集，必须满足结构证据 / Captures an actually opened missing state |
| `capture-settings --state "..."` | 设置页已打开时批量补采已知子页并恢复原设置页 / Batches known tabs within an already-open native Settings surface |
| `capture-shell --state "..." --slot settings-passwords --note "<实际授权>"` | 用户授权并打开配置支持的受保护页后，仅采集外层布局 / Captures only approved outer containers of an already-open protected settings page |
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
| `contrast --state "..." --slot summary` | 弹层打开后补查真实中性文字/单色图标对比，保留逐状态结果 / Audits rendered neutral foreground contrast in the opened state |
| `confirm --stage complete --revision "<hash>" --note "..."` | 整体验收 / Complete acceptance |
| `export --output "<new-folder>"` | 导出当前已确认版本；拒绝覆盖 / Exports the accepted revision without overwriting |
| `restore --state "..."` | 恢复预览前皮肤 / Restores the previous appearance |

`--target` 可选，用于多个原生窗口无法自动唯一定位时。缺少受管会话、旧运行时或未知客户端版本会停止相关步骤，不放宽来源校验。窗口最大化和导航会在盘点结束后恢复；无法恢复会留下阻塞。仅打开安全入口，不提交业务操作。导航选中状态、边界及颜色属于采集内容；正文、输入值和凭据不是。

Use `--target` only when multiple native windows cannot be disambiguated. Missing managed sessions, old runtimes and unknown client versions block dependent steps. Inventory restores window/navigation state and records restoration failures. It never submits business actions or reads messages, input values or credentials.

设置入口未在初始导航中出现时，先用可用UI工具打开原生设置，再执行 `capture-settings`。脚本一次处理实际可访问的已知子页，验证可见且可交互的导航状态；结束或异常时恢复原设置子页。父级设置界面由打开它的UI步骤负责返回原工作区，不把子页恢复误称为已关闭设置。缺失入口保留缺口，密码等受保护状态不进入采集；版本配置中的 `externalStates` 也不由本地批量点击。个人资料属于独立原生页面，配置为 `kind: surface`；用界面工具打开后运行 `capture --slot settings-profile`，必须实际命中可见、非惰性的资料容器。不会把离开设置直接当作外部网页或覆盖成功。若意外跳转使设置表面消失，立即停止并保留未访问项。检查恢复回执，不能只看命令退出码。

`runtime/adapters/authoring-controls-26.1103.json` 维护同一语义状态对应的实际导航键及侧栏控件标签。每项已观察导航带实际目标键；别名变化只失效相关记录，不清空已确认图意或无关采样。预览/导出前也会复核这些记录；隐藏的缓存导航节点不能作为已到达页面的证据。修改配置须对应真实结构证据，不按猜测新增可执行入口。

Open native Settings once through available UI tools, then use `capture-settings` to collect reachable known tabs. The batch attempts to restore the starting tab even on failure; the calling UI workflow returns from Settings to the original workspace. Profile is a standalone native page (`kind: surface`): open it through UI tools, then run `capture --slot settings-profile`. Its visible native structure must match; the automatic batch never opens it. Protected states, known `externalStates`, and missing entries stay explicit gaps. An unexpected departure from the native settings surface stops the batch; inspect restoration receipts, not just the exit code. Versioned control aliases are configuration, and each observation retains its native navigation or surface key. Changed mappings invalidate affected observations before preview/export; hidden or inert cached navigation cannot prove coverage or serve as restoration targets.

## 最小输入 / Minimal inputs

`capture-shell` 不会自动打开页面，必须先确认实际用户授权。它独立于普通盘点器，只读取主表面和设置外层容器的几何及计算样式，不遍历子树、不读取正文、输入值、条目、站点或账号，不截图。设置导航必须证明当前确为目标页；摘要的 `shellOnlyStates` 和编号图目录明确标注“仅外层”，不能解释为内容或控件视觉验收。普通 `capture`、`capture-settings` 和自动盘点仍拒绝受保护页；配置变化使外层证据失效。采集后用原生返回入口恢复原工作区。

`capture-shell` never navigates. Actual user permission must precede opening the configured page. Its separate collector reads only outer geometry and computed styles, never descendant contents, entries, input values, sites, accounts or screenshots. The selected native settings entry must prove the requested state. `shellOnlyStates` and the catalog disclose the limited scope; this is not content or control visual acceptance. Ordinary capture and automatic inventory remain protected, and mapping changes invalidate shell evidence. Restore the original workspace afterwards.

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

用户明确指定文字或边框时，可在 `custom` 模式补充样式，例如浅粉气泡、黑字和一像素玫粉细边框：

```json
{"mode":"custom","colors":["#F8CCD7"],"style":{"text":"#000000","border":"#D98BA4","borderWidth":1},"regionStyles":{"composer":{"surface":"#FFE4EC"}}}
```

`style` 只接受 `text`、`border`、`borderWidth`；`regionStyles` 还可指定 `surface`，键必须是已选择的普通控件/内容区域。色值为 `#RRGGBB`，边框宽度为 0–8。显式文字下只从用户选择的原色中选取可读底色，不再为旧白字自动调暗；对比度不足 4.5:1 时返回区域冲突。显式底色也不偷偷改色。文字和边框修改会使整体预览确认失效，背景确认仍可复用。

代码块、工具卡、改动记录、活动数据和表格保留原语义前景，不接受文字覆盖；这些区域仍按实测前景适配底色。场景背景和滚动条不使用本控件样式覆盖。只对已映射表面设置文字，不使用后代通配选择器；内层显式颜色和混合内容仍须在真实预览时确认。

普通控件会同步已确认的中性文字令牌，用户消息富文本与输入编辑器采用限定目标保证显式黑字生效；不覆盖语法或成功/失败等语义色。透明的聊天定位点与活动展开命中按钮保留原样，不把每个按钮标签都画成实色方块。

盘点覆盖和实际着色分别控制。`regionStyles` 中某个非场景区域设为 `null` 表示保留原生外观（滚动条也可这样保留）；不需要把所有观察过的区域都染色。某个区域的 `surface:null` 表示透明底，需要明确文字颜色。例如：`"assistantMessages":{"surface":null,"text":"#FFFFFF","borderWidth":0}`，配合 `"buttons":null` 保留普通按钮原样。透明底转换为零透明度表面，不伪造固定底色对比通过；实际可读性需看背景预览。这些选择不改变已接受背景。

Coverage and painting are separate choices. A control-region entry of `null` in `regionStyles` retains native appearance, including for scrollbars. `surface:null` within a region creates a transparent surface with an explicit foreground; for example `"assistantMessages":{"surface":null,"text":"#FFFFFF","borderWidth":0}` and `"buttons":null`. Transparency uses zero surface opacity and requires visual readability review over the real scene. Neither choice invalidates the accepted background.

固定交付规则：浅底不能配浅色文字/图标，深底不能配深色文字/图标。完整预览会读取当前实际渲染的几何和计算样式，核对可解析实色背景上的中性文字4.5:1、单色图标3:1；不读取文字内容或输入值。`contrast` 可在打开摘要、菜单、搜索等弹层后补采，同一完整版本和运行时下的已查状态必须全部无已知违规，才能整体确认或导出。报告保存在私有会话目录，不进入主题数据包。图片底、语义彩色、禁用/隐藏状态和截断明确报告边界，不能用“没扫到”代替通过；受保护密码页拒绝此类内层检查。

Complete preview audits actual computed neutral foreground colors, not only requested palette values. Use `contrast` for relevant opened popups; known failures in any recorded state block acceptance/export. Text uses 4.5:1 and monochrome icons 3:1 over resolvable solid backgrounds. Content strings and field values are never read. Images, semantic colors, disabled/hidden states and truncation are explicitly reported limits, and protected password pages are refused.

For explicit text/borders, custom input accepts `style:{text,border,borderWidth}` and per-region `regionStyles` (also allowing `surface`). Explicit foregrounds use an unchanged selected surface with at least 4.5:1 contrast, or fail with the region name. Invalid options fail without replacing accepted colors. Semantic content regions retain native foregrounds; scene and scrollbar styling is separate. Changes invalidate complete-preview acceptance, not accepted background geometry. Native descendants may carry their own colors and still require visual inspection.

## 原生窗口测量 / Native window measurement

保留可用的 CDP 窗口控制。仅在接口明确不支持窗口查询时，使用包内 Windows 原生接口，复核官方会话并按进程身份定位可见顶层窗口。多个窗口需要当前页面焦点与前台窗口唯一对应；无法唯一确定则停止。保存完整窗口位置，再测量普通/最大化的真实网页视口；退出或异常均尝试恢复并核对。恢复失败写入盘点缺口，不能导出。Python 路径不调用 PowerShell；原路径无需新增 Python 依赖。

The native fallback uses EnumWindows, GetWindowThreadProcessId and Get/SetWindowPlacement in the window's DPI context. Every host operation revalidates the managed owner; saved PID/start identity and HWND must still match. It does not launch or terminate the client. A monitor's advertised dimensions are not a measured viewport. API contracts: [window placement](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowplacement), [DPI context](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setthreaddpiawarenesscontext).

## 图片与交付 / Assets and export

缩放比例为 `max(targetWidth/sourceWidth,targetHeight/sourceHeight)`；不得大于 1。裁剪窗口必须完整包含保护框。输入 EXIF 方向先归一，保护框应以用户看到的正常方向定义。输入采用本机 Windows 解码器；PNG/JPEG 是通用输入，WebP 缺少解码器时报错。每张图 20 MiB、解码 6400 万像素、最终包 48 MiB 的限制仍有效。建议针对目标尺寸导出清晰素材，不先生成超大原图再超限提交。

Output is an oriented, subject-preserving PNG. Both source dimensions must meet the measured target. Crop windows must contain the entire ROI. Input decoding depends on Windows; unsupported WebP is rejected. Existing image/pixel/pack limits still apply.

最终包只含清单及引用图；不会带入提示词、原图路径、会话、截图或报告。新清单使用 v2，共享窗口场景或完整主区场景；旧运行时会拒绝它，须先更新运行包。原有 v1 狂三皮肤及其偏好继续使用。

Export includes only the manifest and referenced images. Prompts, paths, sessions and reports stay private. New v2 packs require the updated runtime; existing v1 Kurumi Skins/preferences remain supported.

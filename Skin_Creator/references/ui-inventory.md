# 区域盘点与适配 / UI inventory and adaptation

## 中文

新创作默认使用 `scripts/creator.mjs start`，自动编排已映射的安全页面/设置入口及侧栏状态，测量窗口化和最大化画布，保存覆盖进度并生成编号图表。命令见[创作参考](authoring-cli.md)。以下 `Inspect-UI.ps1` 是保留的单次诊断入口，不承担创作会话编排。自动入口未命中或后置状态不明确时记录缺口，不能声明已遍历。Creator 专用编排位于本包 runtime 内，不需要外部源码目录。

制作前先运行本目录 `Inspect-UI.ps1`；检查结果是用户选择制作范围的基础，不是自动启用所有区域的指令。脚本使用本包运行文件及已验证的官方受管会话；找不到会话时按使用说明配置，不能猜测端口身份或强制退出客户端。

1. 确认目标客户端与适配器版本，记录用户已经指定的区域与排除项。
2. 使用界面工具打开首页、新聊天、普通聊天、Dot、项目、站点和设置等实际可用入口，并检查侧栏展开/收起/悬浮、drawer、相关菜单、问题卡与弹窗。每个状态分别运行入口，使用无个人信息的 `-Label`，例如 `settings-passwords`。不要为了盘点提交消息、修改账号设置或解锁密码。
3. 每份报告遍历已加载区域，并给出未知的结构候选。关闭的shadow root、外部iframe、尚未触发的页面和未访问状态均不属于已完成覆盖。工具受阻时列出缺口，不能补造结果。
4. 合并同一客户端和适配器版本的报告：

```powershell
node runtime/scripts/inspect-ui-regions.mjs --merge "<report-one.json>" --merge "<report-two.json>" --out "work/ui-inventory/combined.json"
```

5. 阅读生成的 `.regions.json`，先按实际布局给一张带编号的简易图，再用同编号的表格说明区域、可见状态、可改背景/渐变/装饰/边框/透明度及约束；参照[图示清单模板](region-catalog-template.md)。`observed`只是已观察，不代表视觉正确；`loaded-hidden`需要打开对应状态，`not-observed`需要继续调查。所有区域初始不自动启用。
6. 对已有明确选择直接执行；否则先让用户选范围。未映射的新模块先审查适配器和配置格式，再提出配置，不把未知键塞入主题清单。
7. 针对旧版本另做适配与验证。保留来源和进程身份校验，检查表面语义、内层底板、滚动裁剪和撤销清理；遵守当前项目测试执行批准流程。

输出默认留在被忽略的 `work/`。报告虽不读取正文，仍属于本地运行信息；不要直接作为公开样例提交。采集输出采用独占创建，不覆盖同名旧报告；重复运行请更换输出名。

## English

New creation starts with `scripts/creator.mjs start`: it orchestrates mapped safe navigation/sidebar states, measures normal/maximized windows, persists progress and generates numbered diagrams. See [the command reference](authoring-cli.md). The `Inspect-UI.ps1` workflow below remains a single-capture diagnostic. Missing entries and unproven navigation outcomes remain gaps. Creator orchestration is bundled in this package's runtime.

Run this folder's `Inspect-UI.ps1` **before authoring**. It uses the bundled runtime and a verified managed official session. Resolve missing setup through the usage guide; do not guess process identity or force-close the client.

Use UI tools to visit relevant available destinations and states: home, new/existing chat, Dot, projects, sites, Settings categories, sidebar modes, drawers, menus, question cards and dialogs. Capture each with a non-personal `-Label`. Do not send messages, change account settings or unlock passwords for inventory.

Each capture scans loaded modules and open shadow roots. Unvisited pages, lazy-loaded content, closed shadow roots and external frames remain uninspected. Merge reports from the same client/adapter versions with the command above. Tool failure must remain a coverage gap.

Use the generated `.regions.json` to present a small numbered diagram based on the observed layout, followed by a matching table of regions, observed state, configurable properties and constraints. Follow the [visual catalog template](region-catalog-template.md). `observed` is not a visual pass; `loaded-hidden` needs its visible state opened; `not-observed` is not proof of absence. Regions are not enabled automatically. Honor an existing explicit selection, or obtain one before authoring. Unmapped candidates need reviewed adapter/schema work first.

Backward compatibility is not supported by default. Adapt and verify older clients separately without weakening origin/owner checks. Check wrapper transparency, scrolling occlusion, restoration and interaction, and follow the workspace's test-approval process.

Reports are local data in ignored `work/` directories. They exclude content text and input values but should still not be published raw. Existing report files are not overwritten; choose a new output name for another capture.

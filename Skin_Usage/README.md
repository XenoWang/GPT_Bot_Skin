# Codex Skin

本目录包含完整运行文件，可单独发布。在本目录运行 `python Build-Zip.py --output ../Skin_Usage.zip`，按本包 `release-manifest.json` 排除私人配置、状态、日志和缓存。不要无筛选压缩已使用的工作目录。

This standalone package includes its own runtime. Run `python Build-Zip.py --output ../Skin_Usage.zip` from this folder to package the reviewed public allowlist. Private state and developer artifacts are excluded. No sibling package is required.

本包内置狂三、Neutral Dark 和「春日樱花」。春日樱花为一体式连续场景：50%背景蒙层，用户消息与输入框为浅樱花粉/黑字，助手回复透明底/白字；仅菜单、弹窗和表单等必要表面使用主题色，其余保留原生外观。

Included Skins are Kurumi, Neutral Dark and 春日樱花 (Spring Sakura). The Sakura Skin uses one shared scene with a 50% dark overlay, pale-pink user bubbles and input with black text, and transparent assistant replies with white text. Native controls are retained outside the selected popup/form surfaces.

## 附加 Python 启动链路 / Additional Python launch route

本包可独立运行，无需同级的其他包。原有 CMD／PowerShell 入口继续保留。以下 Python 3.10+ 命令从解压后的 Usage 目录运行：

```text
python Start-Skin.py --help
python Start-Skin.py configure --proxy-mode direct
python Start-Skin.py
```

以上配置示例选择直连；如果需要本机 HTTP 代理，改用：

```text
python Start-Skin.py configure --proxy-mode proxy --proxy-server 127.0.0.1:7897
```

启动前可运行 `python Start-Skin.py doctor` 只检查依赖与官方包身份。退出皮肤层使用 `python Start-Skin.py restore`；关闭调试端口仍需正常退出客户端。已有普通/旧链路客户端运行时，请保存输入并正常退出；`--wait-for-exit` 只等待，不强制关闭或接管旧会话。

新链路内部不调用 PowerShell，仍需要 Node.js 22+ 和系统允许运行的官方客户端。它不能绕过程序白名单或其他系统策略，不自动修改执行策略或安装依赖。新配置保存在 `runtime/launcher-python.json`，默认状态目录为当前用户本地应用数据目录下的 `CodexSkinPython`。没有新配置时只借用原配置的代理/直连及端口偏好，不修改原 `launcher.json`、旧会话或快捷方式。配置及状态不随包发布。必要时可显式指定 `--state-root`；不要把两条链路指向同一个状态目录。

The original CMD/PowerShell route remains available. The commands above add a Python 3.10+ route that does not invoke PowerShell internally. Node 22+ and the official client must still be permitted by OS policy. No execution-policy change or dependency installation is performed. `configure` writes only `runtime/launcher-python.json`; the separate default state directory is `CodexSkinPython` under the current user's local application data. Legacy proxy/port preferences can be read, but legacy configuration, sessions, shortcuts and Skins are not overwritten. Use `doctor` for read-only discovery, `restore` to remove owned layers, and normal client exit to close the listener. `--wait-for-exit` never force-closes a running client.

Package/source/development-mode, executable/process-creation identity and IPv4 loopback ownership are checked using Windows APIs. Failure stops the new route; it does not fall back to weaker checks or to PowerShell. API references: [package queries](https://learn.microsoft.com/en-us/windows/win32/appxpkg/functions), [package origin](https://learn.microsoft.com/en-us/windows/win32/api/appmodel/nf-appmodel-getstagedpackageorigin), [TCP ownership](https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getextendedtcptable).

Windows Codex Desktop 外观包，附赠「狂三暮光 / Kurumi Twilight」及 Neutral Dark。它启动官方 Store 客户端，通过仅监听 `127.0.0.1` 的 CDP 注入外观，不修改官方应用文件或登录资料。

## 初次运行：让 GPT 帮你安装

把下面这段复制给有本机工具权限的 GPT，并提供下载后的文件夹位置：

```text
请读取 这套文件夹中的 Skin_Usage/SKILL.md，帮我安装并启动这套 Codex Skin，创建桌面快捷方式。
先检查官方 Codex Desktop 与 Node.js 22+。让我选择「本机 HTTP 代理」或「直连」；选择代理时确认地址，使用你提供的本机 HTTP 代理地址。
保留当前登录和配置，不强制关闭客户端。如果需要重新启动，先让我保存输入并正常退出，然后再启动。
完成后检查真实窗口效果，告诉我实际成功的部分和未验证项。
```

在 `Skin_Usage` 文件夹打开 Windows PowerShell，首次配置：

```powershell
powershell.exe -NoProfile -File ".\runtime\scripts\Configure-CodexSkin.ps1" -DesktopShortcut
```

脚本会询问代理或直连。也可明确指定：

```powershell
# Local HTTP proxy / 本机 HTTP 代理
powershell.exe -NoProfile -File ".\runtime\scripts\Configure-CodexSkin.ps1" -ProxyMode proxy -ProxyServer (Read-Host "本机 HTTP 代理地址") -DesktopShortcut
# Direct / 直连（两种方式择一）
powershell.exe -NoProfile -File ".\runtime\scripts\Configure-CodexSkin.ps1" -ProxyMode direct -DesktopShortcut
```

然后双击 `Start-Skin.cmd` 或桌面 Codex Skin 快捷方式。现有普通启动的 Codex 如未开启受管 CDP，先保存草稿并正常退出；启动器最多等待十分钟，不会强制结束客户端。代理模式需先启动本机代理。直连使用 `--no-proxy-server`，只清理启动进程的代理环境，不改系统代理。

需要已安装的官方 Store Codex 和 PATH 中的 Node.js 22+。依赖缺失时由 GPT 按你的授权从官方来源安装；本包不自动安装依赖或绕过脚本执行策略。主配置保存在 `runtime/launcher.json`，进程状态默认在 `%LOCALAPPDATA%\CodexSkin`；可用 `-StateRoot` 指定。运行状态与用户会话不会随包分发。

## 日常使用

新增支持 Creator 输出的 v2 一体式皮肤及完整主场景：常用窗口化/最大化布局由 Creator 预计算，固定尺寸直接复用，新尺寸只补算一次并缓存。原有 v1 狂三皮肤、全部透明度项、侧栏布局和语言选项保持不变。导入新版皮肤前须使用更新后的运行载荷；文件更新不代表当前已打开窗口已加载新引擎。

左侧 **主题 / Skin** 位于 Usage 正上方。右上角 **X** 关闭面板，下面的内容独立滚动。

- 选择 Skin 或导入一个含 `manifest.json` 的完整文件夹。相同 ID 不能重复导入，内置 Skin 不能删除。
- 侧栏可选一张合并背景，或顶部双枪横图＋项目区竖图。最左导航栏独立装饰。
- 透明度按当前 Skin 实际配置生成：狂三当前 35 项，Neutral Dark 2 项。数值越大越不透明；黑色蒙层越大图片越暗。每套 Skin 单独保存，可恢复该 Skin 默认值。
- 狂三主题：用户消息默认绯红 70%＋白色细框；助手消息保持原样；底部输入框纯黑；代码块和 Token 活动卡为黑金 70%。侧栏黑蒙层 70%，主图 50%。
- 默认跟随 GPT 的界面语言；当前有中文、English，其他语言回退 English。可单独固定 Skin 面板语言。[新增翻译文件](references/localization.md)无需改渲染器。
- 「恢复原始外观」只移除皮肤效果并保留管理入口。完全移除本次注入用 `Restore-Skin.cmd`；然后正常退出并从原快捷方式启动以关闭 CDP。

## 文件与兼容性

`runtime/themes/kurumi-twilight/` 是附赠的完整 Skin 文件夹，包含所需图片；`runtime/locales/` 是翻译文件。引擎源码、适配器和构建脚本在 runtime 中，方便后续创作和适配。主题包本身不支持脚本、任意 CSS、远程图片或自定义选择器。

`runtime/themes/spring-sakura/` 只包含主题清单和场景图片。图片成品为1920×1032，经过等比放大与裁切，不宣称原生高分辨率。`runtime/theme-catalog.json` 明确列出内置主题；原两套主题及默认顺序保留。开发同步脚本只同步共有源码，并按各包自己的主题列表重建载荷，不把使用包的额外主题强塞进创作包。

The Sakura folder contains only its manifest and referenced scene image. Its 1920×1032 image was proportionally enlarged and cropped; it is not claimed as native high-resolution output. The explicit package-local catalog preserves the original defaults. Shared code remains identical, while generated payloads may differ with each package's bundled themes.

当前适配 Codex **26.1103.4239.0**，更新客户端后需重新检查原生 UI。Windows 原生对话框、嵌入网页和受保护内容不属于这个渲染器的主题范围。附赠图是为本方案生成/编辑的角色插画，不是官方授权素材声明。全景实际尺寸 **1774×887**；较大视口可能需要放大，应按实际显示尺寸检查清晰度。没有使用模糊填边，不宣称原生 4K。

实机覆盖、未验证项与自动回归状态见 [compatibility.md](references/compatibility.md)。把 Skill 放在本目录可直接让 GPT 读取；若需要自动发现，再按所用客户端的 Skill 安装入口安装。文件夹存在不代表客户端已自动加载它。

## First run in English

The updated runtime accepts Creator v2 unified/shared-scene Skins with precomputed normal/maximized placements and a bounded cache for new sizes. Existing v1 Kurumi assets and all opacity, sidebar-layout and language options are preserved. Updated files alone do not prove that an already open client has loaded the new runtime.

Ask GPT to read this folder's `SKILL.md`, check official Codex Desktop and Node 22+, let you choose local HTTP proxy or direct, configure `runtime/scripts/Configure-CodexSkin.ps1 -DesktopShortcut`, and inspect the real window. Keep your existing login; exit Codex normally if required. Run `Start-Skin.cmd`, open **Skin** above Usage, and select/import a folder. Use **X** to close, or **Restore original appearance** to remove visual changes. `Restore-Skin.cmd` removes the injected manager too. Exit/reopen normally to close CDP. See the compatibility record for the tested boundary.

## 旧版本与区域盘点 / Older clients and UI inventory

**不提供向下版本兼容。** 若当前客户端比适配器目标版本更旧，请让Codex先运行本目录 `Inspect-UI.ps1`，逐页采集实际可用模块和状态，向你展示可配置区域及缺口，然后按[盘点流程](references/ui-inventory.md)调整适配器并验证。不要把脚本视为一键兼容工具。

在本目录执行 `powershell.exe -NoProfile -File .\Inspect-UI.ps1 -Label current`。默认读取受管启动配置；必要时通过 `-StatePath` 指定当前会话文件。报告与区域清单输出在被忽略的work目录。未打开的页面、弹窗和关闭的Shadow DOM不会被计为已检查。

**Backward compatibility is not supported.** For an older client, ask Codex to run this folder's `Inspect-UI.ps1`, visit available pages/states, present the region catalog and coverage gaps, then adapt and verify. This is not a one-click compatibility patch.

From this folder run `powershell.exe -NoProfile -File .\Inspect-UI.ps1 -Label current`. It uses managed launch configuration or an explicit `-StatePath`. Reports and region catalogs are local ignored work files. Unopened pages, dialogs and closed shadow roots remain uninspected. The scanner reads structure/styles only, never messages, passwords or input values, and does not modify the client.

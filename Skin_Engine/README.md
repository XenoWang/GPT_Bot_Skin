# Skin Engine

数据驱动的渲染器与原生界面适配器。主题格式见[创作说明](../Skin_Creator/references/skin-format.md)，安装操作见[使用说明](../Skin_Usage/README.md)。

- `renderer/`：配置校验、布局和管理面板。
- `adapters/`：版本相关的组件映射。
- `locales/`：独立翻译文件。
- `themes/`：主题清单与图片。
- `scripts/`：构建、配置、启动和恢复。
- `scripts/coverage-runner.mjs`、`renderer/authoring.mjs`：Creator 专用覆盖编排与临时预览，不写入正式皮肤数据库。
- `scripts/sync-shared-runtime.mjs`：只同步共享场景所需核心、载荷与使用包校验清单，保留主题/启动配置。
- `scripts/python_launcher.py`、`python_host.py`：附加 Python 主机链路；通过显式后端选择接入原流程，不改原 PS/CMD 入口。独立配置与状态，保留官方包/进程/回环校验。
- `tests/`：离线契约与回归检查。

需要Node.js 22+。在本目录构建：

```powershell
node scripts/build-cdp-payload.mjs
```

开发构建位于被忽略的 `dist/`。使用包保留发布载荷，同步时应更新内容校验清单。

测试需要Python、Node.js和Windows PowerShell；Python依赖在 `tests/requirements.txt`，建议使用独立虚拟环境。临时文件只写入被忽略的 `work/`。从仓库根目录执行：

```powershell
python -X utf8 -m unittest discover -s Skin_Engine/tests -p test_*.py -v
```

测试验证配置边界、几何、状态保存、清理、启动参数与源文件/使用包一致性，不启动真实客户端或访问登录资料。旧ASAR工具仅供离线合成夹具使用，实际启动不采用补丁方式。

个人配置、运行状态和历史报告不是公开测试的依赖；本地维护资料通过仓库根 `LOCAL_CONTEXT.md` 的可选索引查阅。兼容性边界见[使用包说明](../Skin_Usage/references/compatibility.md)。

v2 场景支持一体式窗口背景及分开式的完整主场景，并读取 Creator 预计算的常用窗口尺寸；新尺寸仅补算一次并缓存。原有 v1 主题、透明度、侧栏布局及语言偏好继续保留。构建并同步必要运行文件：`node scripts/sync-shared-runtime.mjs`。该命令是生产构建，不会启动客户端或运行测试。

## 区域盘点 / Region inventory

不提供向下版本兼容。`Inspect-UI.ps1` 调用 `scripts/inspect-ui-regions.mjs` 只读采集当前已加载的模块，并输出结构报告与可配置区域清单。Codex应逐页打开必要状态、重复采集，再按[盘点流程](../Skin_Creator/references/ui-inventory.md)做旧版本适配。报告默认写入被忽略的work目录，脚本不会自动修改界面。

## English

An additive Python launcher/host backend lives in `scripts/python_launcher.py` and `python_host.py`, with an explicit opt-in dispatch in `host-tools.mjs`. The default PowerShell route, original scripts, themes and configuration remain available. Python uses native Windows package/process/TCP APIs and separate state; no policy bypass or dependency installation is attempted. See the Usage and Creator READMEs for entrypoints.

Creator-only coverage orchestration and temporary preview support live in `scripts/coverage-runner.mjs` and `renderer/authoring.mjs`. They do not replace installed Skins. v2 shared scenes use precomputed normal/maximized placements, with a bounded cache for newly encountered sizes; v1 Skins and their configurable preferences remain supported. `node scripts/sync-shared-runtime.mjs` builds and copies only the required shared runtime files and updates the Usage content manifest, without changing themes, launcher configuration or the running client.

The engine contains renderer/configuration logic, version-specific adapters, translations, theme assets, startup/build scripts and offline tests. See the sibling creator format reference and usage guide for authoring and installation.

Requires Node.js 22+. Build from this folder with `node scripts/build-cdp-payload.mjs`; generated developer output is ignored. The usage package keeps its release payload and content manifest synchronized.

Offline tests require Python, Node.js, Windows PowerShell and the declared Python dependencies. Run the regression command shown above from the repository root. The suite checks geometry, preferences, cleanup, launch plans and source/package integrity without starting the real client or reading credentials. Private machine state and historic reports are not public test prerequisites; see the root LOCAL_CONTEXT guide for optional local history.

**Backward compatibility is not supported.** `Inspect-UI.ps1` invokes the read-only region scanner, which outputs structural observations and a configurable-region catalog. Codex must visit relevant pages/states and repeat captures before adapting an older client. Reports stay in ignored work directories. The scanner does not change the UI or guarantee compatibility.

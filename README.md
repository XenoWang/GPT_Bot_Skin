# Codex Skin

[中文](#中文) · [English](#english)

## 中文

仓库提供两个可以分别发布的独立包：

| 目录 | 用途 |
|---|---|
| [Skin_Creator](Skin_Creator/README.md) | 创作技能、区域盘点、图片处理、预览与主题导出；包含自己的运行文件和启动入口 |
| [Skin_Usage](Skin_Usage/README.md) | 安装、使用和管理皮肤；包含运行文件及现有附赠主题 |

两个目录均不要求另一个目录存在。维护源码位于 `Skin_Creator/runtime/`，Usage 保留所需运行副本。创作包和使用包保留 PowerShell/CMD 与 Python 两种启动链路，不修改官方客户端文件、签名或登录资料。不承诺跨客户端版本兼容。

### 分别打包

用户从仓库根自行执行：

```text
python Skin_Creator/Build-Zip.py --output Skin_Creator.zip
python Skin_Usage/Build-Zip.py --output Skin_Usage.zip
```

每个入口只读取本包的 `release-manifest.json` 白名单，核对已审阅的文件内容，排除个人启动配置、会话、日志、缓存与开发测试文件。已有 ZIP 不覆盖。不要无筛选压缩已经使用过的工作目录；忽略规则不会替压缩软件过滤私人文件。主题导出仍由 Creator 的 `export` 命令生成纯数据包，与这里的技能发行 ZIP 不同。

### 源码维护与验证

共享实现以 `Skin_Creator/runtime/` 为维护来源；仅开发者需要显式同步：

```text
node Skin_Creator/runtime/scripts/sync-shared-runtime.mjs Skin_Usage
```

发布清单中的哈希应在审阅改动后更新，不用于掩盖素材异常。从仓库根运行离线回归（按项目审批规则执行）：

```text
python -X utf8 -m unittest discover -s Skin_Creator/runtime/tests -p test_*.py -v
```

历史资料和原始测试记录留在根 `.local/`，入口见 [LOCAL_CONTEXT.md](LOCAL_CONTEXT.md)。未运行真实客户端与完整创作的检查不能宣称实机验收。

## English

This repository provides two independently distributable packages: [Creator](Skin_Creator/README.md) for authoring, inventory, image processing and previews; and [Usage](Skin_Usage/README.md) for installing/managing Skins. Each contains its own runtime and launchers and works without the other folder.

Use each package's `Build-Zip.py` command above to create a ZIP from its reviewed allowlist. Local configuration, sessions, logs, caches and developer tests are excluded; existing ZIPs are not overwritten. Do not blindly compress a used working directory. Skill distribution ZIPs are separate from the data-only Skin folders exported by Creator.

Canonical source is maintained under `Skin_Creator/runtime/`. Synchronization to Usage is an explicit developer operation, not a runtime dependency. The regression command above is for the source checkout; follow the applicable test approval policy. Historical records stay in ignored local maintenance directories. Official client files, signatures and profiles remain intact; compatibility and native visual acceptance require evidence for the actual client version.

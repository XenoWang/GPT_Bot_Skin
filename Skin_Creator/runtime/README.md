# Bundled runtime / 包内运行实现

本目录包含创作包的渲染器、适配器、主机服务、翻译、构建器及内置主题。上层技能使用本目录完成盘点、预览和受管启动，不依赖其他目录的代码。

- `renderer/`：纯数据校验、渲染与临时创作预览。
- `adapters/`：版本区域映射与安全覆盖计划。
- `scripts/`：启动、主机核验、盘点和构建。
- `locales/`、`themes/`：运行面板翻译和现有主题。
- `runtime-profile.json`：本包角色及相应默认状态目录选择。
- 源码副本中的 `tests/`、旧离线补丁夹具和维护同步脚本仅用于开发，不进入普通发行ZIP。

在本目录运行 `node scripts/build-cdp-payload.mjs` 构建载荷。构建不启动客户端，也不等于实机验收。上层 [README](../README.md) 提供使用与打包说明。

This folder contains the runtime used by the standalone Creator package. Rendering, schema validation, host checks, inventory, translations and bundled themes are local. Build the payload with the command above; building is not native UI acceptance. Developer tests, legacy offline fixtures and cross-package maintenance synchronization are excluded from the normal distribution ZIP. See the parent README for launch and packaging.

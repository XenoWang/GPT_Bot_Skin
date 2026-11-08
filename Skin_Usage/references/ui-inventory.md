# 区域盘点 / Region inventory

## 中文

本包的 Inspect-UI.ps1 使用包内 runtime/scripts/inspect-ui-regions.mjs，只采集已加载的原生结构、边界与有限样式，不读取正文、输入值、凭据或外部网页。先通过本包启动入口建立受管会话，或显式指定已有兼容会话的 StatePath。

从本包目录运行：

```text
powershell.exe -NoProfile -File .\Inspect-UI.ps1 -Label current
```

安全打开其他页面或弹窗后分别采集，不提交消息或业务操作。隐藏、未访问、懒加载、截断及待适配范围保持明确缺口。相同客户端与适配器版本的报告可合并：

```text
node runtime/scripts/inspect-ui-regions.mjs --merge "<one.json>" --merge "<two.json>" --out "work/ui-inventory/combined.json"
```

报告保存在本地工作目录，不进入发布ZIP。选择器命中不等于视觉验收；不同客户端版本需另行适配。完整创作可选择单独的Creator包，本包运行与盘点不依赖它。

## English

This package uses its bundled inventory script. Establish a managed session with its own launcher or explicitly select a compatible session. Captures contain loaded native structure, geometry and limited styles, never conversation text, input values, credentials or external pages.

Use the commands above from the package directory. Safely open other states before capturing; never submit business actions for coverage. Hidden, unvisited, lazy-loaded, truncated and unmapped areas remain gaps. Merge only matching client/adapter versions. Selector matches do not prove visual acceptance.

Reports stay local and are excluded from release ZIPs. Creator is an optional separate authoring package, not a dependency for this package's use or diagnostics.

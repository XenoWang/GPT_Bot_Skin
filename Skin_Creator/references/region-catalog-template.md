# 图示区域清单 / Visual region catalog

## 中文

给用户展示可配置区域时，默认先给一张简易布局图，再给同编号的表格。优先使用清晰的文本线框或简单图形，不需要生成装饰插画。图的目的是让用户能说“改C区”，而不必理解选择器名称。

根据盘点报告的边界与实际界面排列区域；下图只是排版示例，不代表当前客户端的实际布局或完整覆盖。窄窗口、隐藏侧栏、浮窗和独立页面分别画状态图，不把不会同时出现的元素强行放进一张图。

```text
+------------------------------------------------+
| A                                              |
+---+-----------+------------------------+--------+
| B | C         | D                      | E      |
|   |           |                        |        |
|   |           +------------------------+        |
|   |           | F                      |        |
+---+-----------+------------------------+--------+
                 +-------------------+
                 | G: separate state |
                 +-------------------+
```

| 编号 | 示例位置 | 可向用户说明的配置 |
|---|---|---|
| A | 顶栏 | 渐变、装饰、背景透明度 |
| B | 最左导航栏 | 底色、装饰、悬浮状态 |
| C | 工作区侧栏 | 合并或分开背景、裁切、蒙层 |
| D | 主内容区域 | 主背景；气泡、代码块等子区域用D1、D2另列 |
| E | 右侧展开栏 | 分别说明标签行、地址行与内容面板 |
| F | 消息输入区 | 输入表面与外围底板分别说明 |
| G | 菜单、弹窗或问题卡 | 按实际打开的类型另画，不暗示同时存在 |

实际交付表格还须列出每项的**盘点状态、可配置内容、限制与是否待适配**。内部可附region键，给用户的主要名称保持自然语言。图与表编号一一对应；清单较长时按页面拆分，不能为了简图省掉待检查模块。

- 已观察：画实线，并说明只代表已找到对应区域，不等于适配通过。
- 已加载但隐藏：画虚线或标注“隐藏状态”，需要打开后确认。
- 未检查或待适配：单独列出；位置未知就不猜位置。
- 不支持配置：注明边界，不呈现为可以直接启用的选项。

先让用户看懂位置，再确认配色、图片和透明度。不要在图里放聊天正文、头像、账号名称或本机路径。已有明确选择直接沿用，不为增加图示重复索要相同确认。

## English

Present a **small layout diagram before the numbered region table** by default. A plain-text wireframe or simple graphic is sufficient; decorative artwork is unnecessary. Users should be able to request “region C” without learning selector names.

Arrange regions from the captured geometry and the observed UI. The diagram above is a formatting example, not a current-client screenshot or proof of complete coverage. Draw separate states for narrow windows, hidden sidebars, dialogs and standalone pages. Do not combine elements that cannot appear together.

Example labels: A top bar, B navigation rail, C workspace sidebar, D main content, E right drawer, F composer, G an independently opened popup. Split message bubbles, code blocks and other subregions into D1/D2 when needed. Preserve the distinction between input surfaces and surrounding backplates, and between drawer tabs and address/content rows.

The actual table must include label, location, observation state, configurable properties, constraints and adaptation needs. Keep diagram and table IDs aligned. Use solid outlines for observed regions, dashed outlines or labels for hidden states, and a separate list for uninspected or unmapped regions. Never invent a location or imply unsupported regions are configurable.

Use natural-language names, split long catalogs by page, and keep personal text/account details out of the diagram. Honor an existing explicit user choice instead of requesting it again solely because a diagram was added.

# Compatibility and validation

旧版皮肤仅支持低于 `26.1117.3838.0` 的客户端。常规旧版范围为 `26.1111.2228.0 ≤ 客户端版本 < 26.1117.3838.0`，另有单独适配的 `26.1103.4239.0`。客户端 `26.1117.3838.0` 本身使用新版皮肤。

Legacy skins support clients strictly before `26.1117.3838.0`. The legacy range is `26.1111.2228.0 ≤ client version < 26.1117.3838.0`, with a separate exact profile for `26.1103.4239.0`. Client `26.1117.3838.0` itself uses the new layout. Later unregistered builds use the new-layout profile until another layout boundary is configured.

Managed launch reads both packages’ version policy from their own `runtime/adapters/versions.json`. An exact profile takes priority. For unregistered builds, `26.1111.2228.0` starts the legacy range and `26.1117.3838.0` starts the new-layout range. Earlier builds require an exact entry, including the supported `26.1103.4239.0`. To fix one release, add an exact profile and rebuild the package. A single-release exception does not advance the layout boundary. The status records the actual client, the source profile and the match type.

Offline tests cover configuration, geometry, per-Skin preferences, translations, cleanup, launch arguments and source/package integrity. They do not prove clean-machine installation, live direct-network startup, native RTL layout, every viewport size or popup state.

Native inspection should cover chat/new-chat/Dot, sidebar hover and collapse, project dialogs, Settings, code blocks, menus, question cards and profile activity. On 26.1117.3838.0 all four bundled skins were checked on the archived chats, passwords (search header only), Codex Cloud, keyboard shortcuts, code review and worktrees toolbars. The outer paint and scroll fade were transparent while the inner controls remained visible. System dialogs, external embedded pages and protected data remain outside the general recoloring scope.

Raw results, screenshots and machine-specific setup records are private maintenance data. Release notes should state supported environments and limits without personal paths or session identifiers.

Planeptune Twin Stars was inspected on the exact profile `26.1111.2228.0` at normal 1342×756 and maximized 1920×1032 viewports. Its main image covers the full maximized canvas outside the navigation rail; closing the sidebar reveals the existing image. The older profile retains shared offline coverage, but this authored Skin has not had a separate live acceptance on that client. Windows system dialogs, external pages, protected contents, unknown versions and unobserved states remain outside this claim. Native semantic colors are preserved; image-backed and disabled content are explicit contrast-audit limits.

On `26.1111.9265.0`, native inspection using the baseline selectors found the title bar, Skin button mount, sidebar, composer, messages, code blocks, tool cards and transcript footer. Menus, settings and dialogs were outside this observation. Creator binds fresh inventory and visual acceptance to the actual client and window.

On 26.1117.3838.0, bundled skins use the new title bar and skip inactive workspace panes. The native picker labels the new layout with its client version. Existing skin IDs, artwork and user preferences are shared with the older layout. Exact profiles take priority. Otherwise the newest configured layout boundary at or below the client version supplies the profile.

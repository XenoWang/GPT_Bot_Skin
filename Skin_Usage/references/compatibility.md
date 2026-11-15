# Compatibility and validation

Managed launch selects an exact Windows Codex Desktop version from `runtime/adapters/versions.json`: `26.1103.4239.0` and `26.1111.2228.0` have independent profiles. The owned companion binds the verified Store-session version to a shared payload. Unknown versions are refused; a similar release number or an `active` status from an older helper is not compatibility evidence. Internal selectors remain version-sensitive, and each profile needs native surface validation. The legacy static build retains its original adapter target.

Offline tests cover configuration, geometry, per-Skin preferences, translations, cleanup, launch arguments and source/package integrity. They do not prove clean-machine installation, live direct-network startup, native RTL layout, every viewport size or popup state.

Native inspection should cover chat/new-chat/Dot, sidebar hover and collapse, project dialogs, Settings, code blocks, menus, question cards and profile activity. The latest search-surround transparency change still needs page-by-page visual confirmation. Its shared layout and cleanup behavior has offline regression coverage. System dialogs, external embedded pages and protected data remain outside the general recoloring scope.

Raw results, screenshots and machine-specific setup records are private maintenance data. Release notes should state supported environments and limits without personal paths or session identifiers.

Planeptune Twin Stars was inspected on the exact current profile `26.1111.2228.0` at normal 1342×756 and maximized 1920×1032 viewports. Its main image covers the full maximized canvas outside the navigation rail; closing the sidebar reveals the existing image. The older profile retains shared offline coverage, but this authored Skin has not had a separate live acceptance on that client. Windows system dialogs, external pages, protected contents, unknown versions and unobserved states remain outside this claim. Native semantic colors are preserved; image-backed and disabled content are explicit contrast-audit limits.

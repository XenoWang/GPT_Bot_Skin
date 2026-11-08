# UI coverage checklist

Record actual version, viewport, visible DOM boundary, inner/background/pseudo surfaces, hover/selected/focus state, computed RGBA, and result. A matching selector alone is insufficient.

| Area | States to inspect |
|---|---|
| Navigation/titlebar | Profile/Usage stay visible, avatar circular, short-height layout, independent decorative layers and gradient alpha |
| Sidebar | expanded/collapsed/hover peek, cached hidden header, merged/split, crop subject-safe top and bottom, divider |
| Main scene | normal/max, both sidebars open/closed, one-image coordinates, no blur seams |
| Chat/new chat/Dot | user-only bubble, pure-black composer, growing composer, transparent footer, content clipping, top fade, route changes |
| Rich text/code | selection toolbar outer/inner shape, sticky ActionBar, copy, syntax, horizontal/vertical scroll |
| Project/sites/library | page shell, search inputs, empty cards, create project name/folder field, nested panels |
| Menus/questions | Add root AND sticky group headers, model/permission popup, question choices, tooltips, disabled/focus/selected |
| Profile | avatar, featured-work card, Token activity card alpha; retain heatmap data |
| Drawer | tab strip transparent, address strip themed, ShadowRoot tree variables; preserve interactions |
| Skin manager | Controls derived from each Skin’s actual enabled fields, per-pack persistence/reset, numeric bounds, language fallback, top-right X, scrollbar gap, restore/import/delete |

Common Settings categories to inspect when available (navigate without changing values): General, Notifications, Import, Profile, Appearance, Account, Archived chats, Parental controls, Trusted contact, Voice, Storage, Agent, Personalization, Pets, Keyboard shortcuts, Usage, Data controls, Plugins, Passwords, Computer use, Appshots, Browser use, Cloud computer, Hooks, Connections, Codex Cloud, Code review, Git, Worktrees. Record unavailable categories rather than claiming they passed. Do not unlock credentials or alter account/security settings for a color audit.

Known shared families: bordered rounded groups (including overflow-visible), ring-only groups, bg-page-search, settings popup buttons, sticky header + ::after. Preserve native illustrative previews instead of recoloring every gray element. See the public experience guide for recurring causes and scoped remedies.

Search/filter surroundings: inspect the wrapper separately from the input. Settings sticky backgrounds must be transparent when removing a surround; preserve input focus/border and content clipping. Gray-free is not sufficient evidence. Keep release-specific verification and private failure history separate from the public guide.

# Offline regression prerequisites

Run from the source repository root with Python, Node.js 22+ and Windows PowerShell available: `python -X utf8 -m unittest discover -s Skin_Creator/runtime/tests -p test_*.py -v`. Install `requirements.txt` into the chosen isolated Python environment. The ignored local `_deps/` directory beside this file is also supported for the official validator's YAML dependency.

Skill validation uses the official skill-creator `quick_validate.py`. It is located from the current user's standard Codex skills installation, or from an explicit `CODEX_SKILL_VALIDATOR` path. If unavailable, the suite fails with a clear prerequisite error; it does not silently skip or substitute weaker validation.

The delivery test requires `fixtures/release-files.json`. Paths in this mandatory snapshot are repository-relative and confined to the checkout. It retains source/package byte equality and checksums of the public source, configuration and documentation. Local execution history, absolute-path freeze records and machine state are not prerequisites for a public clone.

When accepted public files change, review the changes before refreshing this fixture. Do not replace expected hashes merely to hide unexplained corruption. The snapshot intentionally excludes itself, generated developer builds, local results and ignored private data.

Tests write to the bundled runtime's ignored `work/` directory; the Creator CLI export fixture also creates and removes a uniquely named synthetic session under `Skin_Creator/work/`, because the production CLI confines authoring sessions there. They do not start the real client, create desktop shortcuts, inspect credentials or publish anything. Follow any execution-approval policy active in the current workspace.

## Selective control styling and rendered contrast

Control fixtures preserve accepted backgrounds while selecting native regions or transparent white assistant replies. Complete confirmation/export refuse a missing or failed rendered contrast receipt. The contrast collector runs against a synthetic style/geometry tree whose content/value/markup getters throw: white-on-white is 1:1, black on RGB 45 is 1.52:1, and half-black over white is 3.98:1. Visible aria-hidden icons must be inspected. Image-backed, semantic, disabled/hidden and otherwise unresolved rendering remains a reported limit rather than an inferred pass; no changed foreground makes the check explicitly not applicable.

Renderer fixtures require narrow neutral text propagation, unchanged code/status colors, native transparent hit areas, painting on the actual rounded summary panel with inherited inner/pseudo background variables, decorative layers outside native drag-region calculation, and clipping to the whole composer/question stack. Synthetic DOM/stylesheet checks do not prove physical mouse delivery; the requested live authoring review supplies that separate evidence.

## Package-specific bundled themes

The optional package-local theme catalog retains the original two defaults and can append validated data-only Skins. Tests reject traversal, duplicates, changed defaults, oversized catalogs and manifest identity mismatches. Usage deliberately includes Spring Sakura while Creator retains its original samples. Shared implementation bytes are still identical; only the explicit catalog/theme data and their generated payloads differ. Existing isolated ZIP rebuilds must reproduce each package's payload byte-for-byte with both original package directories blocked, so this is not a waiver for misplaced functions or missing dependencies.

## Creator rewrite coverage

`test_creator.py` adds Node contracts, syntax checks and a real Windows image-codec check using an independently encoded red/blue PNG. New Node cases cover hand-calculated cover cropping, protected-detail conflicts, known contrast ratios, stage/revision gates, generated-prompt gating, unified/separate manifests, saved window placements and bounded caching, extendable locale files, safe structural navigation helpers, escaped numbered diagrams, temporary preview restoration and multiselect controls, and data-only export with tamper/overwrite rejection. Existing route-layout cases also exercise shared-background rendering across synthetic native regions.

Oracles come from the confirmed behavior, explicit mathematical examples and synthetic inputs, not captured implementation output. The matching-version inventory fixture now uses equal client/adapter versions; a separate negative assertion requires review when they differ. Existing theme fingerprints and all original opacity/layout/translation regressions remain in force.

Navigation and preview DOM cases are mocks; they do not establish live adapter coverage, actual screenshots, every text color, WebP decoder availability, or real generation-provider integration. Those need subsequent user-directed unified/separate Skin creation trials. No test approval is inferred from this README.

Standalone Profile coverage uses a native surface specimen rather than a selected Settings tab. The settings-batch regression still forbids clicking that entry and requires restoration. Separate manual-capture cases reject absent, hidden and inert structures, trap content/value reads, preserve the previous report and invalidate evidence when the configured surface changes. The tool-card selector contract comes from observed direct activity-header ancestry; it preserves the legacy selector and disabled bundled-theme configuration. These checks do not establish browser layout or visual acceptance.

## Additional Python launch route

`test_python_launchers.py` covers separate configuration/state, unchanged legacy PS/CMD and theme fingerprints, strict Store/development/process/port/browser identity boundaries, argument vectors and child-only environment changes, refusal to take over a running client or foreign session, and opt-in Node host dispatch. Official package discovery and client startup use synthetic providers/mocks; no real Codex instance is launched or configured.

Native ABI checks inspect only the test interpreter and one temporary IPv4 loopback listener. Python image checks use independently encoded PNG/TIFF fixtures, including a 90-degree orientation case; output pixels are decoded by an independent small PNG reader. No external network traffic, credentials, dependency installation or real desktop shortcut is involved. Both Python `--help` entrypoints are exercised without starting the app.

The full regression still exercises the preserved PowerShell route and therefore needs Windows PowerShell on the test machine. This does not make PowerShell a dependency of the new Python launch route. Real Store-package discovery, native startup/reuse/restore, OS policy restrictions and complete Creator sessions through that route remain separate live-validation work.

## Standalone package migration

Tests are now maintained in `Skin_Creator/runtime/tests/`. Cross-package source comparisons use the repository root explicitly; runtime-profile metadata is the sole deliberate role-specific exception (Creator versus Usage). All common runtime file bytes are still compared. Legacy fingerprint paths were relocated without changing theme expectations; the reviewed inspection-entrypoint and launch-profile changes are tracked separately.

`test_standalone_packages.py` builds test-only ZIPs from isolated copies containing private sentinels, checks exact archive membership, hashes and deterministic timestamps, renames the extracted folders, and exercises each package without any sibling package. Creator runs an isolated status session; Usage configuration traps process/client operations. Both rebuild their payload entirely from bundled files. These temporary ZIPs are verification fixtures, not user release artifacts.

The old whole-working-tree privacy assertion is replaced by checks of the actual release allowlist and generated ZIP contents: a used working tree may legitimately contain ignored personal configuration, which must never enter the artifact. Traversal, duplicate names, changed files and overwrite attempts are negative cases. Role tests independently require separate default state-directory names in both Python and PowerShell. No real client startup or screenshot is performed by this suite.

Package isolation also blocks reads from both original workspace packages. Node child processes use the Node filesystem permission model, with access only to the selected isolated package and explicit test paths. Python children inherit a test-only audit guard via a temporary sitecustomize module; guard activation and propagation through Node-to-Python spawning are checked. The real source directories and the live runtime are never moved or hidden for testing.

JavaScript import closure is obtained from Node's SourceTextModule parser, not regular expressions over strings/comments. Positive controls distinguish a real re-export from saved import text; negative controls require a real missing import, an existing misplaced sibling module, and reads of each original package to be rejected. The Creator image helper is also exercised inside isolation. These are accidental-dependency controls for trusted code, not an OS security sandbox against malicious native code.

## Native Creator windows and explicit control styles

`test_creator_window_style.py` runs `window-style.test.mjs` for CDP/native dispatch, ambiguous targets, wrong identity/receipts, ordinary and interrupted inventory restoration, measured viewports, explicit pink/black/border output, invalid options and acceptance invalidation. Window transitions in these Node cases use synthetic providers; the actual inventory orchestration is exercised with injected connections, not a duplicate test implementation.

Python ctypes and the compiled C# helper are checked against the documented 44-byte WINDOWPLACEMENT layout and fixed JSON coordinate fixtures. One test creates a hidden, non-activating window owned by the test interpreter, reads it, rejects access with an incorrect owner, and destroys that same fixture. It never maximizes, shows or changes the real client. The actual PowerShell conversion function is loaded through its parsed definition; neither the client nor a live managed session is invoked. Both full helper entrypoints reject an invalid port before window actions. Isolated Creator extraction additionally loads the new Python helper while original Creator and Usage reads remain blocked.

Expected styles come from the requested unchanged pink surface, black foreground and one-pixel border. Equal foreground/background colors must be rejected (contrast 1:1), and semantic regions retain native text. No snapshots are refreshed from test execution. Live window maximum/restoration, client-owned descendant colors and complete Skin visuals remain part of the subsequent authorized creation flow, not a claim of these offline checks.

## Settings batch and navigation aliases

Protected settings shell tests use only synthetic outer rectangles and styles. Descendant, text, value and markup reads throw; only the two approved outer selectors are accepted. Separate orchestration cases require a genuine authorization note to be supplied by the caller, correct native navigation, configured scope and a distinct shell-only receipt. Ordinary capture and automatic settings navigation remain blocked. Summaries disclose shell-only states, and configuration changes invalidate evidence. The tests do not create human permission or read real credentials.

The attachment renderer fixture models the observed outer card, image base and hover ring sharing a selector. Only the outer card may receive the Skin marker; the image node and both inner layers must survive refresh and cleanup unchanged. Actual browser appearance still requires the user-directed draft-attachment preview.

`settings-capture.test.mjs` exercises the actual inventory and batch-capture orchestration with an isolated DOM/connection provider. Expected native keys are the independently observed Images, General, Plugins, Hooks and Git entries. Tests require changed aliases to invalidate only affected observations, reject unsafe route keys, ignore hidden cached selections, and accept sidebar labels from configuration without source-language edits.

The batch fixtures include reachable tabs, missing entries, a hidden stale selection and a visible protected password entry. They require actual capture receipts for reachable tabs, refusal to enter the protected state, preservation of gaps, restoration after capture errors, blocking on restoration failure, and refusal of a different inventory window before navigation. Synthetic settings nodes throw if their content or values are read. Connection opens/closes must balance, including failure paths. These are mocked navigation/collection checks, not live application coverage or proof that every installed client's settings entry exists.

A live-discovered Profile entry that leaves the native Settings surface is retained as a regression fixture. Its initial external-content classification was later corrected by actual native-page inspection; the no-click and restoration assertions remain in force. Standalone native pages and known external entries must remain unvisited by the settings batch; an unexpected departure stops traversal without relabeling all remaining entries as missing. Inert cached controls cannot prove navigation or receive restoration clicks. Focused editable fields pause the batch without reading their values. The original no-click assertion was first run against the unchanged implementation and detected the defect; its expected result is not derived from a repaired output.

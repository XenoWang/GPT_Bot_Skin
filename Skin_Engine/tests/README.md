# Offline regression prerequisites

Run from the repository root with Python, Node.js 22+ and Windows PowerShell available. Install `requirements.txt` into the chosen isolated Python environment. A local isolated YAML dependency directory under `work/` is also supported.

Skill validation uses the official skill-creator `quick_validate.py`. It is located from the current user's standard Codex skills installation, or from an explicit `CODEX_SKILL_VALIDATOR` path. If unavailable, the suite fails with a clear prerequisite error; it does not silently skip or substitute weaker validation.

The delivery test requires `fixtures/release-files.json`. Paths in this mandatory snapshot are repository-relative and confined to the checkout. It retains source/package byte equality and checksums of the public source, configuration and documentation. Local execution history, absolute-path freeze records and machine state are not prerequisites for a public clone.

When accepted public files change, review the changes before refreshing this fixture. Do not replace expected hashes merely to hide unexplained corruption. The snapshot intentionally excludes itself, generated developer builds, local results and ignored private data.

Tests write to the engine's ignored `work/` directory; the Creator CLI export fixture also creates and removes a uniquely named synthetic session under `Skin_Creator/work/`, because the production CLI confines authoring sessions there. They do not start the real client, create desktop shortcuts, inspect credentials or publish anything. Follow any execution-approval policy active in the current workspace.

## Creator rewrite coverage

`test_creator.py` adds Node contracts, syntax checks and a real Windows image-codec check using an independently encoded red/blue PNG. New Node cases cover hand-calculated cover cropping, protected-detail conflicts, known contrast ratios, stage/revision gates, generated-prompt gating, unified/separate manifests, saved window placements and bounded caching, extendable locale files, safe structural navigation helpers, escaped numbered diagrams, temporary preview restoration and multiselect controls, and data-only export with tamper/overwrite rejection. Existing route-layout cases also exercise shared-background rendering across synthetic native regions.

Oracles come from the confirmed behavior, explicit mathematical examples and synthetic inputs, not captured implementation output. The matching-version inventory fixture now uses equal client/adapter versions; a separate negative assertion requires review when they differ. Existing theme fingerprints and all original opacity/layout/translation regressions remain in force.

Navigation and preview DOM cases are mocks; they do not establish live adapter coverage, actual screenshots, every text color, WebP decoder availability, or real generation-provider integration. Those need subsequent user-directed unified/separate Skin creation trials. No test approval is inferred from this README.

## Additional Python launch route

`test_python_launchers.py` covers separate configuration/state, unchanged legacy PS/CMD and theme fingerprints, strict Store/development/process/port/browser identity boundaries, argument vectors and child-only environment changes, refusal to take over a running client or foreign session, and opt-in Node host dispatch. Official package discovery and client startup use synthetic providers/mocks; no real Codex instance is launched or configured.

Native ABI checks inspect only the test interpreter and one temporary IPv4 loopback listener. Python image checks use independently encoded PNG/TIFF fixtures, including a 90-degree orientation case; output pixels are decoded by an independent small PNG reader. No external network traffic, credentials, dependency installation or real desktop shortcut is involved. Both Python `--help` entrypoints are exercised without starting the app.

The full regression still exercises the preserved PowerShell route and therefore needs Windows PowerShell on the test machine. This does not make PowerShell a dependency of the new Python launch route. Real Store-package discovery, native startup/reuse/restore, OS policy restrictions and complete Creator sessions through that route remain separate live-validation work.

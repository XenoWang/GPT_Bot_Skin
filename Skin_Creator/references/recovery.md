# Targeted recovery and reusable records

Use this module when a command fails, a visual defect recurs or the user reports a mismatch. Query first; do not load the whole catalog or repeat broad inspection.

```powershell
node scripts/creator.mjs recovery --session work/my-skin --note "titlebar gap"
node scripts/creator.mjs diagnose --session work/my-skin --state "<managed-session.json>" --slot titlebar
```

Lookup returns at most three relevant cases plus the latest matching local history. The topbar diagnostic reads only mapped geometry and owned-layer styles, writes a private evidence artifact, and does not navigate or alter the window. A missing paint layer, invalid reference or intercepted input remains a failure. It covers the recurring topbar case's solid, gradient and shared-image branches; hidden/zero-size/inert cached pages are not geometry references.

CLI errors automatically include matching recovery hints when available. The original error and nonzero exit remain intact if lookup is unavailable. Hints do not authorize new actions or automatically execute arbitrary fixes.

Contrast failures also report the safe mapped region/tag and return matching foreground guidance. The state label describes the whole captured screen, not necessarily the failing widget: for example, a bubble check may reveal a hovered titlebar label. Read the reported region first. If guidance is unavailable, the original failed contrast result still blocks acceptance.

After a verified fix, append a record using `recovery-record --input record.json`. Example shape:

```json
{
  "id": "CREATOR-UNIFIED-TITLEBAR-GAP-001",
  "status": "resolved",
  "symptom": "A solid topbar stopped before the content boundary.",
  "resolution": "Extended only the owned decoration layer using valid visible references.",
  "verification": "Record the actual scoped regression and native diagnostic outcome here.",
  "keywords": ["titlebar", "topbar", "顶栏"],
  "evidence": ["diagnosis-titlebar-example.json"]
}
```

Use `observed` before a fix and `reopened` when it recurs. `resolved` requires a nonempty resolution, actual verification and existing session-relative evidence; a known failed JSON report is rejected. The script hashes evidence and appends an immutable private event under the package's `.local/recovery/`, so later creation sessions can query it. It does not edit public guidance, reset failure counts, create user consent or convert synthetic results into native acceptance. Keep the original Bug ID and every previous record.

Public reusable cases are maintained in `recovery-cases.json`; their user-facing text is in `locales/<locale>.json` under `recovery.*`, with English fallback. Add a catalog entry and locale strings for a new shared case; no source edit is needed. Promote only verified, reusable lessons after removing private paths, identities, screenshots and local logs. Session-specific history remains excluded from release manifests.

When a diagnosis is uncertain, record what was observed and the remaining boundary. Stop retrying at the project's failure limit. Apply its production/test phase and exact-command approval rules before verifying code changes; a recovery record is evidence bookkeeping, not permission.

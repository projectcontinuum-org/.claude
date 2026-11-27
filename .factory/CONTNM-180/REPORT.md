# Kotlin language intelligence and workbench memory — Feature report
Date: 2026-11-28 · Status: READY WITH OPEN ITEMS

## Overview
The workbench now provides Kotlin completion, hover, signature help, and semantic diagnostics for the Kotlin Script
node editor and for `.kt` files. The Script editor uses a standalone Monaco model with a hidden context wrapper for
`row` and `flow`; the wrapper is never saved. Real files use the bundled `fwcd.kotlin` extension. The feature is
packaged offline with a pinned Kotlin language server and JRE, and new workbenches have memory defaults suitable for
the language tooling.

## How to use it
Open a Kotlin Script node and type `flow.` or hover `flow.set`; the status chip reports starting, ready, or
unavailable. Open a `.kt` file in the workbench file editor for file-language support. Save continues to store exactly
the script text entered by the user.

## What changed
| Repo | Area | Change | Key files |
|---|---|---|---|
| continuum-workbench | LSP and packaging | Added generic Theia/Monaco bridge, Kotlin registration and prelude, pinned `fwcd.kotlin` plugin, JRE/server image packaging, settings seeding, status UI, and editor-language isolation. | `language-server-extension/`; `workflow-editor-extension/src/browser/{components/node-dialog,contribution,hooks,store}`; `Dockerfile`; `entrypoint.sh`; `scripts/*`; READMEs and release notes |
| continuum-feature-base | Script contract | Documented/pinned `row` and `flow` bindings and `ScriptFlowVariables` API with a contract test. | `features/continuum-feature-analytics/.../KotlinScriptNodeModel.kt`; `ScriptFlowVariables.kt`; `.../KotlinScriptBindingsContractTest.kt` |
| continuum-platform-core | Workbench resources | Raised defaults and presets, validated request ≤ limit after merging partial resources, updated tests and API documentation. | `continuum-cluster-manager/{src,frontend}`; `docs/api/continuum-cluster-manager.openapi.yaml`; release notes |
| continuum-system-tests | Verification | Added bridge/image helpers and API/UI suites for LSP, packaging, security, lifecycle, memory, and editor behavior. | `lib/*lsp*`, `suites/api/kotlin-lsp-*`, `suites/ui/kotlin-lsp.mjs`, `test/*` |
| continuum-docs | User/contributor docs | Added Kotlin editing, language-intelligence architecture, and workbench-resource pages. | `docs/feature-nodes/base-analytics.md`; `docs/architecture/language-intelligence.md`; `docs/deployment/workbench-resources.md` |

### API changes
No new platform endpoint. The existing workbench create/update resource contract now rejects a merged request above
its matching limit with HTTP 400; the committed OpenAPI spec and inventory describe this rule.

### Documentation
The unreleased `continuum-docs/docs/` site has three pages added or updated. `npm run build` passed.

### Breaking changes / upgrade notes
The image is larger and includes JRE 21 plus fwcd Kotlin language-server assets. New workbenches default to
2Gi request / 4Gi limit. Existing workbenches retain their stored resources until recreated or updated.

## Acceptance results
| Criterion | Status | Evidence |
|---|---|---|
| Script completion, hover, signature help, diagnostics, independent dialogs, and exact save text | VERIFIED | Prior browser round passed these scenarios, including visible completion/hover/signature widgets, independent diagnostics, and save round-trip. |
| Kotlin `.kt` file intelligence | VERIFIED | Prior browser round: type-error marker, `listOf` hover, and `xs.ma` completion passed; `fwcd.kotlin` activated only for real files. |
| Kotlin `.kts` support | PARTIALLY VERIFIED | Completion and deliberate error passed, but upstream `MISSING_SCRIPT_STANDARD_TEMPLATE` whole-file false diagnostic and a hover error remain. |
| Graceful unavailable/restart behavior | VERIFIED | Prior browser round passed editing, save, status transitions, restart, and unavailable handling; system lifecycle checks passed. |
| Script context and position mapping | VERIFIED | Language-server specs passed; system diagnostics confirmed exact user line/column and clean `row`/`flow` script. |
| Offline production image and bridge security/lifecycle | VERIFIED | Round-3 image run: 65 passed, 0 failed, 1 skipped as uid 1000 with `--network none`; bridge dev run 63 passed, 0 failed, 3 skipped. |
| First edit after diagnostics nudge and BOM settings seeding | VERIFIED | Round-3 system test passed the first-edit fix and all BOM seed cases; image run passed 49, 0 failed, 1 skipped. |
| Memory ceiling and JVM launch flags | VERIFIED | System checks observed `-Xmx512m` plus JVM caps and RSS below the 1000 MB restart ceiling. |
| Workbench resource defaults and validation | VERIFIED | `continuum-cluster-manager`: 289 tests pass offline; OpenAPI generation/drift and redocly validation pass. Requests above limits return 400. |
| Production workbench build and serving | VERIFIED | Workbench build #5 succeeded; `:3005` returned HTTP 200. |
| Final browser visual/regression round | NOT VERIFIED | Browser tester and final system tester did not return because of temporary Copilot API DNS errors. The prior browser/system round passes remain valid evidence; no final visual regression claim is made. |

## Quality
- Unit/type tests: language-server-extension **228/228** and `tsc` pass; system-test helper `npm test`
  **171/171** and `npm run check` pass; cluster-manager **289** tests pass offline.
- System tests: round 3 passed the first-edit fix, BOM seed cases, and offline image checks.
- Browser tests: prior round passed the Script dialog, `.kt`, fallback, save, isolation, and unchanged non-Kotlin
  editors; final visual/browser regression is **NOT VERIFIED**.
- Reviews: backend review is approved with no blocker/major findings; 12 minor and 11 nit findings remain. The
  frontend review's requested wording/transport-guard fixes are present, but its final re-review response was not
  returned.
- Fix rounds used: three implementation/fix rounds.

## Kotlin behavior and accepted limits
- The selected server is fwcd Kotlin language-server 1.3.13, wrapped as `.kt`; `.kts` is limited.
- The server provides semantic diagnostics but no syntax-error markers for missing braces, parentheses, or similar
  parser errors. The node may report those errors when it runs.
- The hidden function wrapper can report false “cannot be local” diagnostics for top-level `object`, `enum class`,
  `interface`, `typealias`, and `const val` declarations. The runtime engine's acceptance of those declarations was
  not verified.
- JSON editors remain uncoloured by design; the workbench does not register JSON for these controls.

## Pod memory facts and decisions
- Default and Small preset: **2Gi request / 4Gi limit**.
- Shifted ladder: **4Gi/8Gi**, **8Gi/16Gi**, **16Gi/32Gi**; existing workbenches are unchanged.
- A merged request greater than its limit returns **400** rather than a later deployment failure.
- Operators on small clusters must check node capacity before upgrading; the chart itself does not set workbench pod
  memory.
- While the user was unavailable, the implementation chose a dedicated bridge for standalone Script Monaco, fwcd for
  files, a separate editor language id, fixed overflow widgets, the shifted ladder, no JSON colors, and documented
  language-server limits.

## Open items
- **MINOR:** `.kts` false whole-file diagnostic and one internal hover error remain upstream limitations.
- **MINOR:** no syntax-error markers; wrapper false positives for script-level declarations are documented but not
  filtered because runtime acceptance is unknown.
- **MINOR/NIT:** several approved-review implementation-quality items remain (connection retry console noise, limits on
  bridge input, process-tree/memory accounting details, and small lifecycle/disposal cleanups).
- **NOT VERIFIED:** thin browser-only build, real OOM restart path, unseeded `yarn start` auto-seeding, and runtime
  acceptance of the script-level declarations.
- The local Docker tag `projectcontinuum/continuum-workbench:0.0.16` is a working-tree image, not the published
  baseline. Restore/pin a separate tag before using compose or comparing against the release.

## User actions before merge
1. Re-run the final browser/system regression when the temporary API/DNS failure is gone.
2. Restore the published `0.0.16` image tag, or pin the working-tree image under a separate local tag, before compose
   validation and baseline comparisons.
3. Decide whether to accept the documented `.kts`, syntax-marker, and top-level-declaration limits as-is.
4. Review the remaining minor/nit findings and verify node capacity for the shifted memory ladder.
5. Commit each repository's working-tree changes and the factory report through the normal merge process.

## Discrepancies
- The historical pod-memory artifact contains superseded 1Gi/2Gi values; the final implementation, release notes,
  OpenAPI, tests, and current evidence use 2Gi/4Gi.
- Some artifact sections describe earlier failing rounds; this report uses the later fixed round where available.
- The docs artifact says the docs build passed, matching the current `continuum-docs` working tree; no product files were
  changed by this report.

## Knowledge updates
None. The knowledge pages were already updated by the preceding phases; this report did not edit them.

No commits were made.

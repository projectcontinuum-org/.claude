# Kotlin Script editor builds its context from the node's reported bindings — Feature report
Date: 2026-11-28 · Status: READY WITH OPEN ITEMS

## Overview
The Kotlin Script node now tells the workbench which names its script can use (`row`, `flow`) and ships the Kotlin source of the `flow` API, KDoc included. The workbench builds the editor's language-server context from that report. The hand-copied `ScriptFlowVariables` prelude and the seed file in the workbench are gone, so the editor can no longer drift from the real API. A new member on the API shows up in the editor after a worker rebuild, with no workbench change. A worker that reports nothing, or something malformed, gives a plain code editor with no errors and saving is unaffected. All changes are uncommitted.

User story: as a node author, I want a node to report its script bindings itself, so the workbench does not carry a copy that binds feature-base to the platform core.

## How to use it
- User: open a workflow, double-click a Kotlin Script node, edit `script`. `flow.` offers `get/set/all`, hover shows KDoc, a type error gets a marker. KDoc appears on hover only, not in completion items (server limitation).
- Node author: put `options.scriptContext = {language, bindings:[{name,type}], declarations}` on the code control's UI schema (see the docs page below). The Kotlin Script node does it through `ScriptContextReport`.

## What changed
| Repo | Area | Change | Key files |
|---|---|---|---|
| continuum-feature-base | Kotlin Script node | `ScriptFlowVariables` is an import-free interface; the runtime class moved to `ExecutionContextFlowVariables`. The build ships the interface file as resource `script-context/ScriptFlowVariables.kt`. `ScriptContextReport` reports it verbatim (package line stripped, fails on missing resource or `import`) in the `script` control's `options.scriptContext`. | `ScriptFlowVariables.kt`, `ExecutionContextFlowVariables.kt`, `ScriptContextReport.kt`, `KotlinScriptNodeModel.kt`, `build.gradle.kts`, README |
| continuum-feature-base | Tests | Old `KotlinScriptBindingsContractTest` deleted. New `ExecutionContextFlowVariablesTest`, `ScriptContextReportTest`, `KotlinScriptReportedContextTest` (names, types, declarations equal shipped resource and source) | `src/test/.../node/` |
| continuum-workbench | Generic core | Language-neutral editor contexts and hidden context documents. A context document is opened and acknowledged before the script. Documents are shared by content, ref-counted, and isolated per connection. | `common/EditorContext.ts`, `browser/ContextDocuments.ts`, `DocumentSynchronizer`, `LanguageSession`, `LanguageIntelligenceService`, `LanguageServerRegistration.ts` |
| continuum-workbench | Kotlin | Parser/validator for the reported context (64 KiB, 32 bindings, identifier, type and declaration checks, never throws). Prelude and registration are built from the bindings. Seed file and mirrored member list removed. | `kotlin/KotlinScriptContext.ts`, `KotlinScriptPrelude.ts`, `KotlinScriptRegistration.ts` |
| continuum-workbench | Editor UI | `options.scriptContext` is forwarded opaquely; the editor re-attaches only when its JSON changes. | `EditorContextKey.ts`, `useLanguageIntelligence.ts`, `CodeEditorRenderer.tsx`, footer, store |
| continuum-workbench | Guards, docs | `GenericityGuard.spec` also scans the pass-through files and fails if the old mirrored API names return. Guard, translator and multiplexer specs cover context URIs. README, AGENTS, release note v0.0.16. | specs, `AGENTS.md`, `language-server-extension/README.md` |
| continuum-system-tests | Suites | Helper builds the reported context from the real `ScriptFlowVariables.kt` (`FEATURE_BASE_DIR` override, SKIP when absent). Bridge group `context`. UI scenarios `no-context`, `bad-context`, `twocontexts`. Image suite copies the source in. | `lib/kotlin-script.mjs`, `suites/api/kotlin-lsp-bridge.mjs`, `suites/ui/kotlin-lsp.mjs`, `kotlin-lsp-image.mjs`, Makefile, README, AGENTS |

### API changes
No platform endpoint, OpenAPI or core change. Node metadata gains `options.scriptContext` inside `propertiesUISchema` for the `script` control. `propertiesSchema` is unchanged.

### Documentation
continuum-docs, unreleased version, edited by the backend developer (no separate technical-writer run): `docs/contributing/create-new-nodes/design-the-settings-dialog.md` (new section on `scriptContext`) and `docs/feature-nodes/base-analytics.md` (older worker gives a plain editor). **Docs build not run.**

### Breaking changes / upgrade notes
- A worker without this feature-base change reports no context, so its Kotlin editor is plain (highlighting only) until the worker is updated. Update workers with the workbench.
- `ScriptFlowVariables` is now an interface. Anything constructing it directly must use `ExecutionContextFlowVariables`.

## Decision to flag
`scriptContext` lives in the script control's **UI-schema options**, not in `propertiesSchema` as the request wording suggested. The schema is validated and shown to MCP/AI clients; the UI schema is not, and no platform-core change is needed. Other defaults taken: Kotlin source plus a bindings list as the shape, and no hardcoded fallback for old workers. The plan's per-context key was replaced by a core-owned per-connection namespace.

## Acceptance criteria
| AC | Criterion | Status | Evidence |
|---|---|---|---|
| AC-1 | Node reports bindings and declarations equal to the compiled API file | PARTIALLY VERIFIED | `KotlinScriptReportedContextTest`, `ScriptContextReportTest` pass; system-test helper output equals the compiled resource. Live metadata fetch from a running platform stack not done |
| AC-2 | Dependency-free interface, implementation unchanged | VERIFIED | `ExecutionContextFlowVariablesTest`, `KotlinScriptNodeModelTest` (32), gradle test green (also re-run by reviewer) |
| AC-3 | Reported names and types match what `execute` binds; drift fails the build | VERIFIED | `KotlinScriptReportedContextTest` |
| AC-4 | Real server: `flow.` completion, hover KDoc, type error, valid silent | VERIFIED (completion without KDoc, KDoc on hover) | Bridge `context` group, 41/41 with `context,diagnostics,documents,security,handshake`; spike 16/16 |
| AC-5 | No mirrored API in workbench; generic core language-neutral | PARTIALLY VERIFIED | `GenericityGuard.spec`, `KotlinScriptRegistration.spec` (unit, 279 pass); frontend review APPROVED |
| AC-6 | Wrapper, import and filter built from bindings; no "never used" warning for `row`-only | VERIFIED | Prelude and registration specs; UI scenario `valid` pass |
| AC-7 | No or malformed context gives a plain editor | VERIFIED | `KotlinScriptContext.spec`; UI `no-context`, `bad-context` (5 malformed) pass |
| AC-8 | Different contexts isolated, same contexts shared | VERIFIED (chrome light theme only) | `ContextDocuments.spec`; bridge `context`; UI `twocontexts` 3/3 (two tabs) |
| AC-9 | Context documents hidden; URI allow-list; no seed file | PARTIALLY VERIFIED | Unit specs and bridge `security`, `documents` pass. Bridge `leak` group not run |
| AC-10 | Dialog completion, hover, diagnostic, valid, save | VERIFIED | UI `completion`, `valid`, `diagnostics`, `hover`, `save`; screenshots `.claude/.screenshots/CONTNM-180-dynamic-bindings/ctx-01..14` |
| AC-11 | New API member needs no workbench change | PARTIALLY VERIFIED | Follows from AC-1/3/5 tests and review; never exercised by adding a real member |
| AC-12 | Docs, README/AGENTS, release note | PARTIALLY VERIFIED | Review only; docs build not run |

Counts: VERIFIED 6, PARTIALLY VERIFIED 6, NOT VERIFIED 0, FAILED 0.

## Quality
- Unit tests: feature-analytics gradle test pass; language-server-extension 279, workflow-editor-extension 197, `tsc --noEmit` both pass; system-tests `npm run check` and `npm test` pass (175 before the fix round).
- System tests: round 1 blocked by a defect (below); after the fix, bridge 41/41 on `context,diagnostics,documents,security,handshake`.
- Browser tests: UI scenarios `completion`, `valid`, `diagnostics`, `hover`, `save`, `no-context`, `bad-context`, `twocontexts` pass on a rebuilt dev workbench (:3005, temporary config, light theme).
- Reviews: backend APPROVED (3 MINOR, 2 NIT); frontend APPROVED (3 MINOR, 3 NIT). Reviews predate the fix round and were not repeated.
- Fix rounds: 1. The readiness probe planned a script with no context and the Kotlin registration threw, so every server stayed `unavailable`. The frontend developer made planning accept no context and added a spec running the real registration through the initializer. Also fixed FR-1, FR-2, FR-3.

## Open items
- **NOT VERIFIED:** bridge groups `lifecycle`, `coldwindow`, `leak`; UI scenarios other than the eight above (fallback, kill-early, channel, journey, hung…); the image suite (offline container run); live node metadata from a running platform stack; dark theme.
- Backend review, open: BR-1 (extract the base UI schema out of the call), BR-2 (`withScriptContext` mutates and unchecked-casts maps), BR-3 (positional args in tests), BR-4, BR-5 (nits).
- Frontend review, open: FR-4 (`escapeRegExp` local helper), FR-5 (suite files over 1,300 lines), FR-6 (recorded). FR-1, FR-2 and FR-3 were fixed in the fix round, but not re-reviewed.
- Completion items carry no KDoc (server limitation); KDoc is on hover only.
- Docs build (continuum-docs) not run.

## User actions before merge
1. Run the continuum-docs build and check the two edited pages.
2. Run `make kotlin-lsp` including `lifecycle`, `coldwindow`, `leak`, the remaining UI scenarios and the image suite. Check the dark theme once.
3. Check `options.scriptContext` in the node metadata of a running platform stack with the rebuilt worker.
4. Optionally have the frontend fix round re-reviewed. Decide on the MINOR findings.
5. Commit per repo (feature-base, workbench, system-tests, docs); release feature-base and the workbench together. No yarn.lock change, no client regeneration, no OpenAPI lint needed.

## Discrepancies
- continuum-system-tests shows many untracked `lib/`, `suites/`, `test/` files and edited Makefile/package.json. Most belong to the earlier Kotlin LSP work that is also uncommitted. Only the files named in the artifacts belong to this feature.
- The frontend developer's round 1 said the backend artifact was absent, so it used the planned shape. It was checked in round 1b against the real source and needed no change.
- The frontend developer's notes say the knowledge pages were updated; `.claude/knowledge` is not a git repo, so this report could not confirm it through diffs.
- The frontend review reports FR-1..FR-3 as open; the fix round resolved them, with no re-review.
- No file claimed as changed was missing from the diffs. The two continuum-docs files match the diff.

## Knowledge updates
1. **Page `workbench.md` (language intelligence)** — Context flow: node UI schema `options.scriptContext` → `CodeEditorRenderer` → footer → `useLanguageIntelligence(editor, language, editorContext)` (keyed by JSON in `workflow-editor-extension/src/common/EditorContextKey.ts`) → `LanguageIntelligenceService.attach(model, languageId, registrationId?, rawContext?)` → `registration.parseContext` (`undefined` means plain editor) → `ContextDocuments.acquire` → hidden `continuum-script:/ctx<hash>….kt` documents. Namespace `ctx<hash><6-char scope>[n<k>]`, package `continuum.<namespace>`. Evidence: files in the workbench diff.
2. **Same page, pitfall** — Open a script only after its context document is acknowledged by an awaited `documentSymbol` request (`DocumentSynchronizer.contextReady`, default timeout 5 s), or the first analysis is lost. Evidence: `ContextDocuments.ts`, spike notes.
3. **Same page, pitfall** — `LspServerInitializer.waitUntilReady` plans a readiness probe with no context, so `registration.virtualDocuments.plan` must accept an undefined context. Unit specs with a fake registration miss this; `KotlinScriptRegistration.spec.ts` runs the real one. Evidence: system-tester round 1 and `LspServerInitializer.ts:87`.
4. **Same page, convention** — `LanguageServerRegistration<C>` has optional `parseContext` and `contextDocuments`, and `diagnosticFilter` may depend on the context. The Kotlin registration has no seed files and no member list. `GenericityGuard.spec.ts` fails if `FLOW_VARIABLE_MEMBERS`, `SCRIPT_BINDING_NAMES`, `CONTEXT_FILE_SOURCE`, `ContinuumContext` or `ScriptFlowVariables` return to non-spec workbench sources.
5. **Page `architecture.md` or the feature-base page** — `continuum-feature-analytics` ships `ScriptFlowVariables.kt` as resource `script-context/ScriptFlowVariables.kt` (`build.gradle.kts`, `processResources`). `ScriptContextReport` strips the package line and builds `options.scriptContext`; the file must stay import-free. `KotlinScriptReportedContextTest` guards against drift. Wire limits are checked in `KotlinScriptContext.ts`: ≤ 64 KiB, ≤ 32 bindings, type ≤ 300 chars.
6. **Page `architecture.md` (decision)** — Node-reported editor data lives in UI-schema `options`, not `propertiesSchema`: the schema is validated and exposed to MCP/AI clients, the UI schema is not.
7. **Page `dev-environment.md`** — `continuum-system-tests/lib/kotlin-script.mjs` reads the real `ScriptFlowVariables.kt` from `continuum-feature-base` (override `FEATURE_BASE_DIR`); suites SKIP dependent checks when it is absent. A workflow dialog shows one node at a time, so multi-dialog UI scenarios need two editor tabs/workflow files. `npm`/`yarn` are not on PATH: use `~/.nvm/versions/node/v22.23.2/bin`.

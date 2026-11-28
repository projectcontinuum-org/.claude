
## Round 1
### Tasks
| Task | Status | Notes |
|---|---|---|
| FE-1 spike | DONE | **PATH=second-document**; see `spike-context-documents.md`, raw `spike/` |
| FE-4 | DONE | `kotlin/KotlinScriptContext.ts` parser/validator |
| FE-2 | DONE | generic context documents (`ContextDocuments`, `EditorContext`), gate in synchronizer/session/service |
| FE-3 | DONE | no production change needed (guard/translator already accept `continuum-script:/ctx….kt`); specs added |
| FE-5 | DONE | Kotlin prelude/registration use context; seed file removed. Used the plan's scriptContext shape (`03-backend-dev.md` absent) |
| FE-6 | DONE | `scriptContext` forwarded opaque as 4th `attach` argument; re-attach only when its JSON changes |
| FE-7 | PARTIAL | language-server README, knowledge graph, release note done; `GenericityGuard` not extended |
| FE-8 | NOT STARTED | out of scope |

### Files changed
language-server-extension: `common/EditorContext.ts`, `common/LanguageServerRegistration.ts`, `browser/{ContextDocuments,DocumentSynchronizer,LanguageSession,LanguageIntelligenceService,VirtualDocument}.ts`, `kotlin/{KotlinScriptContext,KotlinScriptPrelude,KotlinScriptRegistration}.ts`, specs, README. workflow-editor-extension: `common/EditorContextKey.ts`, `hooks/useLanguageIntelligence.ts`, `store/LanguageIntelligenceStore.ts`, `CodeEditorRenderer.tsx`, `LanguageIntelligenceFooter.tsx`. Release note v0.0.16.

### Specs added/changed
KotlinScriptContext.spec (validation, limits, injection), KotlinScriptPrelude.spec, KotlinScriptRegistration.spec, EditorContext.spec, ContextDocuments.spec (order/barrier/sharing/isolation/wire loss), ClientMessageGuard / VirtualUriTranslator / LanguageServerMultiplexer specs (context URI accepted, foreign access refused, closed on disconnect), EditorContextKey.spec (opaque forwarding, change identity). The orchestrator should map these to the plan's ACs.

### Test selectors
None added (no new UI elements). Existing `language-intelligence-footer`.

### How to see it
Open a workflow with a Kotlin Script node, double-click it, edit the `script` field: type a bound name / `.` for completion, hover for KDoc, a type error shows a marker. Needs the backend to put `options.scriptContext` in the UI schema.

### Verification
- `yarn workspace @continuum/language-server-extension test` PASS (275); `yarn workspace @continuum/workflow-editor-extension test` PASS (197); `tsc --noEmit` both PASS.
- Spike run against real fwcd 1.3.13: PASS (context-first with barrier 16/16).
- NOT VERIFIED: browser behaviour, workbench build, system tests.

### User actions required
Rebuild the workbench before browser tests. No yarn.lock change, no client regeneration.

### Docs updated
language-server-extension README, release notes v0.0.16, knowledge (workbench.md, graph.json, change-log).

### SCOPE / questions
- Plan's `contextKey` replaced by a core-owned per-connection namespace (a URI can be owned by one connection only; equal contexts in two tabs would collide).
- Context documents are reopened on wire change only (the bridge already replays after server restart).
- Completion items carry no KDoc (server limitation); KDoc is hover-only.

## Round 1b
### Tasks
| Task | Status | Notes |
|---|---|---|
| FE-5 check | DONE | The real shape (bindings `row`, `flow`; declarations without package line or imports, starting with the KDoc) is accepted unchanged. A new spec in `KotlinScriptContext.spec.ts` builds that context from the real `ScriptFlowVariables.kt` (skips when the feature repository is not next to the workbench). No mismatch, no code change. |
| FE-7 | DONE | `GenericityGuard.spec.ts` now also scans the editor-extension pass-through files (`EditorContextKey.ts`, footer, renderer, store) for language tokens, and a new test fails when any non-spec source in either workspace (Kotlin directory included) names the old mirrored API (`FLOW_VARIABLE_MEMBERS`, `SCRIPT_BINDING_NAMES`, `CONTEXT_FILE_SOURCE`, `ContinuumContext`, `ScriptFlowVariables`). AGENTS.md and the language-server README describe the dynamic model; release note, knowledge pages already done in round 1. |
| FE-8 | DONE (not run against a live workbench) | See below. |

### Files changed (round 1b)
- workbench: `language-server-extension/src/common/GenericityGuard.spec.ts`, `src/kotlin/KotlinScriptContext.spec.ts`, `AGENTS.md`, `language-server-extension/README.md`.
- system tests: `lib/kotlin-script.mjs` (+ `test/kotlin-script.test.js`), `suites/api/kotlin-lsp-bridge.mjs`, `suites/api/kotlin-lsp-image.mjs`, `suites/ui/kotlin-lsp.mjs`, `AGENTS.md`, `README.md`.
- Added in round 1b to the language-server specs: guard accepts a context document URI and a `documentSymbol` request on it, refuses look-alikes; translator maps it both ways; multiplexer: another connection cannot touch it, it is closed with the connection's scripts.

### System-test changes (continuum-system-tests)
- `lib/kotlin-script.mjs`: `reportedContextFromFeatureSource()` reads `continuum-feature-base/.../ScriptFlowVariables.kt` (override `FEATURE_BASE_DIR`), strips the package line and returns `{context}` (bindings row, flow) or `{skip: reason}`; `contextDocument`, `weaveScript(..., scriptContext)` (header from the bindings, import of the namespace package); `FLOW_MEMBERS`/`CONTEXT_PACKAGE` seed constants gone.
- Bridge suite: `openContext()` opens the context document and awaits a `documentSymbol` answer before any script (the open-order rule); `weave(lsp, …)` uses the session's context. New group `context` (flow completion, KDoc hover, type mismatch, valid silence, two isolated contexts, non-virtual URI refused, close frees it). `leak` now expects `continuum.ScriptFlowVariables` to be unresolved without a context (no seed); the private-directory check expects an empty directory. Groups that need `flow`/`row` (diagnostics, memory, exhaustion) SKIP or use plain scripts when the feature source is absent. The image suite copies the feature source into the container and sets `FEATURE_BASE_DIR`, so the offline run keeps working with no network.
- UI suite: the node's schema carries `options.scriptContext` from the helper; new scenarios `no-context`, `bad-context` (5 malformed reports), `twocontexts`; scenarios that need the real report are NOT VERIFIED-skipped when the source is absent.

### Specs added/changed (round 1b) → AC
`KotlinScriptContext.spec` (real report accepted) → AC-1/AC-5; `GenericityGuard.spec` → AC-5; `ClientMessageGuard`/`VirtualUriTranslator`/`LanguageServerMultiplexer` specs → AC-9; `test/kotlin-script.test.js` (helper, context document, header from bindings, skip) → AC-4/AC-6.

### Test selectors
No new `data-testid`. New suite names: UI scenarios `no-context`, `bad-context`, `twocontexts`; bridge group `context`.

### Verification
- `yarn workspace @continuum/language-server-extension test` PASS (278); `yarn workspace @continuum/workflow-editor-extension test` PASS (197); `tsc --noEmit` both PASS.
- `npm run check` PASS; `npm test` PASS (175) in continuum-system-tests.
- NOT VERIFIED: the bridge `context` group and the new UI scenarios (no workbench was running; they need a rebuilt workbench with this branch and, for the UI suite, a browser); the image suite change; the existing bridge/UI checks that now go through `openContext`.

### User actions required
Rebuild the workbench, then run `make kotlin-lsp` (bridge, UI) against it; the UI and image suites need `continuum-feature-base` next to the system tests (or `FEATURE_BASE_DIR`).

### SCOPE / questions
- AC-10's `completion` scenario still expects KDoc only where the server gives it (hover); completion items carry none.

## Fix round 1

### Tasks
| Task | Status | Notes |
|---|---|---|
| Readiness-probe BLOCKER | DONE | `planScriptDocument` now accepts no context (no parameters, no import, neutral header `fun continuumScript<key>(): Any? = run {`); `KotlinScriptRegistration.plan` delegates and no longer throws. |
| FR-1 release-note bullet | DONE | Bullet moved above the Full diff line. |
| FR-2 | DONE | `ContextDocuments`: open settles on fulfil and reject; synchronous throw of `sendRequest` is caught. |
| FR-3 | DONE | `DocumentSynchronizer`: `contextReady().then(proceed, proceed)`. |

### Specs
- `KotlinScriptRegistration.spec.ts`: "plans a neutral document" and a new spec that runs the REAL registration through `LspServerInitializer` (probe text checked, initialization resolves) — covers the blocker.

### Verification
| Command | Result |
|---|---|
| language-server-extension test | PASS (279) |
| workflow-editor-extension test | PASS (197) |
| tsc --noEmit both workspaces | PASS |
| `yarn build:workbench` | PASS |
| Live workbench on :3005 (temp config dir, JDK 21, idle timeout 15 s) | started, Kotlin server ready (no longer 'unavailable') |
| Bridge suite `ONLY=context,diagnostics,documents,security,handshake` | PASS, 41/41 (incl. all 6 `context` checks) |
| UI scenarios completion, valid, diagnostics, hover, save, no-context, bad-context | PASS (all checks) |
| UI scenario twocontexts | first run crashed: a workflow shows one node dialog at a time, so the scenario was wrong, not the product. Reworked to use two editor tabs (as `twodialogs`); then PASS 3/3 |
| `npm run check` (system tests) | PASS |
Not run: bridge groups lifecycle/coldwindow/leak, other UI scenarios (fallback, kill-early, channel, journey, hung...).

### Screenshot
`.claude/.screenshots/CONTNM-180-dynamic-bindings/ctx-01-completion-flow-dot.png` (`flow.` completion from the reported context); also ctx-02..14 and ctx2-01/02 (twocontexts).

### Cleanup
Workbench CLI + backend stopped by PID, port 3005 free, no Kotlin JVMs left, temp config/workspaces dirs and build log removed.

### Other
System-tests change: `suites/ui/kotlin-lsp.mjs` scenario `twocontexts` now uses two workflow files.

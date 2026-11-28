# Plan: Nodes report their script bindings; the workbench builds the Kotlin editor context from them

Autopilot defaults applied: Q-1 `options.scriptContext` of the `script` control · Q-2 Kotlin source + binding list · Q-3 `ScriptFlowVariables` split into an interface file shipped as a classpath resource · Q-4 nothing reported → plain editor · Q-5 fold the declarations into the hidden header if a second document does not work (decided by FE-1).

Wire shape (the contract both sides build to), inside the `script` control of `propertiesUISchema`:

```json
"options": { "format": "code", "language": "kotlin", "rows": 15,
  "scriptContext": { "language": "kotlin",
    "bindings": [ {"name":"row","type":"Map<String, Any>"}, {"name":"flow","type":"ScriptFlowVariables"} ],
    "declarations": "<Kotlin source of ScriptFlowVariables.kt WITHOUT its package line>" } }
```

Rules both sides rely on: `declarations` carries no `package`/`import` lines (the node strips the `package` line from the shipped file; the workbench rejects a context that still has one, and adds `package continuum.ctx<hash>` itself); binding `name` matches `^[A-Za-z_][A-Za-z0-9_]*$`; `type` is a non-empty single-line string; total `scriptContext` size ≤ 64 KB.

## Acceptance criteria
| ID | Criterion | Verified by |
|---|---|---|
| AC-1 | The Kotlin Script node's `propertiesUISchema` has, on the `script` control, `options.scriptContext` with `language` `kotlin`, bindings `row: Map<String, Any>` and `flow: ScriptFlowVariables` (names = `ROW_BINDING`/`FLOW_BINDING`), and `declarations` equal to the compiled `ScriptFlowVariables` API source file minus its package line | [unit] `KotlinScriptReportedContextTest`; [system-api] metadata fetch check in the k6 suite if the stack is up |
| AC-2 | `ScriptFlowVariables` is a dependency-free interface in its own file; the runtime class implements it; the file is on the classpath as a resource; `execute` still binds `row` and `flow` and flow-variable behaviour (get/set/all, `set(null)` refused) is unchanged | [unit] `KotlinScriptNodeModelTest` (existing, green) + `ExecutionContextFlowVariablesTest` + `KotlinScriptReportedContextTest` |
| AC-3 | The node reports exactly what it executes: the reported binding names equal the names `execute` puts into the script scope, and every reported binding type is declared in the reported declarations or is a Kotlin stdlib type; a reported-vs-real drift (declarations ≠ shipped file, implementation not implementing the interface) fails the feature-base build | [unit] `KotlinScriptReportedContextTest` (replaces `KotlinScriptBindingsContractTest`) |
| AC-4 | The real fwcd Kotlin server, given the reported declarations as a second hidden document plus the wrapped script, offers `get/set/all` on `flow.` with KDoc, shows KDoc on hover, reports a type mismatch for `val x: Int = flow.all()`, and no diagnostic for a valid script. If not, the spike records the header-fold fallback and AC-4 is re-verified on that path | [system-api] spike harness run (FE-1, evidence `spike-context-documents.md`); re-run as `kotlin-lsp-bridge.mjs` group `context` (FE-8) |
| AC-5 | In the workbench source `ScriptFlowVariables`, `FLOW_VARIABLE_MEMBERS`, `SCRIPT_BINDING_NAMES`, `CONTEXT_FILE_SOURCE`, `ContinuumContext.kt` and the literal bindings `row`/`flow` do not occur (outside spec fixtures that are clearly synthetic); no seed file is registered for `kotlin-script`; the generic core stays language-neutral | [unit] `GenericityGuard.spec.ts` (extended in FE-7), `KotlinScriptRegistration.spec.ts` |
| AC-6 | The wrapper function's parameter list, the import of the context package and the "Parameter '<name>' is never used" diagnostic filter are all built from the reported bindings (a context with bindings `a`,`b` yields `fun …(a: T1, b: T2)` and filters those two names only); a script using only `row` shows no "never used" warning | [unit] `KotlinScriptPrelude.spec.ts`, `KotlinScriptRegistration.spec.ts`; [browser] FE-8 scenario `valid` |
| AC-7 | `CodeEditorRenderer`/`useLanguageIntelligence` pass `uischema.options.scriptContext` to `attach`; with no context, or a malformed one (wrong types, bad binding name, `package` line in declarations, over 64 KB), the editor is a plain code editor: no connection, no chip, no markers, no exception; saving is unaffected | [unit] `KotlinScriptContext.spec.ts`, `useLanguageIntelligence` spec, `LanguageIntelligenceService.spec.ts`; [browser] scenario `no-context` |
| AC-8 | Context documents are opened before the user's document, keyed by a content hash: identical contexts share one document (ref-counted, closed when the last editor detaches, reopened after a server restart); two nodes with different contexts each see only their own declarations and no redeclaration error appears | [unit] `ContextDocuments.spec.ts`, `DocumentSynchronizer` spec; [browser] scenario `twocontexts`; [system-api] `kotlin-lsp-bridge.mjs` group `context` |
| AC-9 | Diagnostics on context documents never reach the user; the URI allow-list still rejects every URI that is not a virtual document URI (context documents use the same `continuum-script:/` scheme with key `ctx<hash>`); the private workspace no longer contains any seed file | [unit] `ClientMessageGuard.spec.ts`, `PrivateWorkspace`/registry specs, `VirtualUriTranslator.spec.ts`; [system-api] group `security` + changed `leak`/`documents` checks |
| AC-10 | In the Kotlin Script dialog (real workbench, worker-shaped metadata) `flow.` completes `get/set/all` with KDoc, hover shows KDoc, a wrong type gets a diagnostic, a valid script none; the stored script text equals the typed text (no hidden lines) | [browser] `kotlin-lsp.mjs` scenarios `completion`, `valid`, `diagnostics`, `hover`, `save` (against a dev build) |
| AC-11 | A developer who adds a member to the real API interface sees it offered with no workbench change: the reported declarations are the compiled file, no workbench test names a member | [unit] AC-1/AC-3 tests + [review] (no workbench member list exists, AC-5) |
| AC-12 | Docs for node authors explain how a node reports a script context; workbench README/AGENTS/knowledge describe the dynamic model and no longer mention the mirrored prelude; release notes carry an upgrade note (older worker ⇒ plain editor until feature-base is updated) | [review] |

## Backend tasks

### BE-1 Split `ScriptFlowVariables` into interface + implementation and ship the interface file as a resource
- Repo/module: `continuum-feature-base`, `features/continuum-feature-analytics`
- Files:
  - `src/main/kotlin/org/projectcontinuum/feature/base/analytics/node/ScriptFlowVariables.kt` (becomes `interface ScriptFlowVariables`: `get`, `set`, `all` with the existing KDoc, **no imports**, nothing but the API; KDoc no longer mentions the workbench prelude)
  - `.../node/ExecutionContextFlowVariables.kt` (new: `class ExecutionContextFlowVariables(executionContext: ExecutionContext) : ScriptFlowVariables`; the current bodies, incl. `requireNotNull` on `set`)
  - `.../node/KotlinScriptNodeModel.kt` (only `ScriptFlowVariables(executionContext)` → `ExecutionContextFlowVariables(executionContext)`; remove the KDoc paragraphs that tell the developer to edit the TS prelude)
  - `build.gradle.kts` (module): `tasks.processResources { from("src/main/kotlin/org/projectcontinuum/feature/base/analytics/node/ScriptFlowVariables.kt") { into("script-context") } }` (resource `script-context/ScriptFlowVariables.kt`)
- Change: pure refactor plus resource wiring. The developer first verifies that the convention plugin `org.projectcontinuum.feature` leaves `processResources` extendable (`./gradlew :features:continuum-feature-analytics:processResources`, then look in `build/resources/main/script-context/`). If it does not work, STOP and report: the fallback (string constant + reflection test, Q-3 alternative) changes BE-2/BE-3.
- Units: `ScriptFlowVariables` = the API contract only; `ExecutionContextFlowVariables` = the runtime behaviour backed by `ExecutionContext`.
- Unit tests: new `ExecutionContextFlowVariablesTest` (get prefers output over input variable, set refuses null, set delegates, all merges with output winning; moved from the old contract test's last cases); existing `KotlinScriptNodeModelTest` stays green.
- Docs: none yet (BE-3).
- Depends on: —
- Covers: AC-2

### BE-2 Report `scriptContext` in the Kotlin Script node's UI schema
- Repo/module: `continuum-feature-base`, `features/continuum-feature-analytics`
- Files: `.../node/ScriptContextReport.kt` (new), `.../node/KotlinScriptNodeModel.kt` (uiSchema assembly)
- Change: new focused collaborator `ScriptContextReport` (single responsibility: build the `scriptContext` map). It reads the resource `script-context/ScriptFlowVariables.kt` once, strips the `package` line (and fails fast with a clear message if the file contains an `import`, since the workbench contract forbids it), and builds `{language:"kotlin", bindings:[{name,type}…], declarations}`. Binding names come from `ROW_BINDING`/`FLOW_BINDING`; types are named once in constants next to them (`ROW_BINDING_TYPE = "Map<String, Any>"`, `FLOW_BINDING_TYPE = "ScriptFlowVariables"` derived from `ScriptFlowVariables::class.simpleName`). `KotlinScriptNodeModel` keeps its `uiSchema` JSON text and adds the report by parsing the JSON then setting `scriptContext` into the `script` control's `options` (no hand-written copy of declarations in the JSON text). `propertiesSchema` is untouched, so the validator and the MCP node tools see nothing new.
- Unit tests: `ScriptContextReportTest` (shape; no `package`/`import` line; declarations contain `interface ScriptFlowVariables` and the three members' KDoc; size < 64 KB; missing resource ⇒ a clear exception, never an empty context).
- Docs: none yet (BE-3).
- Depends on: BE-1
- Covers: AC-1, AC-11

### BE-3 Replace the bindings contract test; docs and release note
- Repo/module: `continuum-feature-base` (+ `continuum-docs`)
- Files:
  - delete `src/test/kotlin/.../node/KotlinScriptBindingsContractTest.kt`; new `KotlinScriptReportedContextTest.kt`
  - `continuum-docs/docs/contributing/create-new-nodes/design-the-settings-dialog.md` (new section "Giving a code field editor intelligence: `scriptContext`": the wire shape above, the rules, how the feature-base node does it, what an older workbench does) and `continuum-docs/docs/feature-nodes/base-analytics.md` § "Editing a Kotlin script" (completion knows the names the node reports; today `row` and `flow`)
  - feature-base release notes / changelog if the repo has one (developer checks; none found at repo root), README of the analytics feature if it mentions the flow API
- Change: `KotlinScriptReportedContextTest` asserts: (1) the node's `propertiesUISchema` reports bindings whose names equal `ROW_BINDING`/`FLOW_BINDING`; (2) **executes what it reports**: run the node on a one-row input with a script that echoes `row` and `flow` and a second script referencing a name that is not reported → the unreported name fails to compile, and each reported name resolves (names collected from the report, not hard-coded); (3) every binding type is a stdlib type or declared by name in the reported declarations; (4) reported `declarations` == shipped resource minus package line == the repo source file (read via `src/main/kotlin/...` path, catches a stale resource); (5) `ExecutionContextFlowVariables` implements `ScriptFlowVariables`; (6) `ScriptFlowVariables` interface has no public property. The old reminder comments about the TS prelude are gone with the file.
- Depends on: BE-2
- Covers: AC-3, AC-11, AC-12

## Frontend tasks

### FE-1 Spike: does the real fwcd server resolve reported declarations as a second hidden document?
- Repo/module: `continuum-workbench/language-server-extension` (no production code), evidence in `.factory/CONTNM-180-dynamic-bindings/`
- Files: `.factory/CONTNM-180-dynamic-bindings/spike/run-context-spike.mjs` (a copy/extension of `../CONTNM-180/spike/run-spike.mjs`, which already launches the server from `continuum-workbench/.kotlin-ls` against a private workspace with `didOpen`), `spike-context-documents.md` (result)
- Change: with an EMPTY private workspace (no seed file) run these on the real server: (A) `didOpen` of `continuum-script:/ctxABC.kt` holding `package continuum.ctxABC` + the real `ScriptFlowVariables.kt` text (package line removed) and then `didOpen` of the wrapped script (`import continuum.ctxABC.*`, `fun continuumScriptK(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {`…`}`), using the real URI translation (not-yet-existing files of the private directory): measure `flow.` completion, hover KDoc, `val x: Int = flow.all()` error, valid-script silence, and no "unresolved reference ScriptFlowVariables"; also timing of the first answer when the context document is opened immediately before the script; (B) the same but the script opened first and the context document second (does a re-analysis happen without a `didChange`?); (C) two different contexts defining the same simple class name in different packages, each script importing its own; (D) the fallback: declarations folded into the script's hidden header (`object`/same file, per-document).
- Output: a verdict table and one decision line: `PATH=second-document` or `PATH=header-fold`, with the required open order. FE-3, FE-4 and FE-5 implement exactly that path. If (A) works but (B) does not, the document order requirement is recorded and FE-3 must guarantee it.
- Unit tests: none (evidence is the run output, quoted in the md).
- Docs: none.
- Depends on: — (Can start now; BE tasks not needed, the file text is read from the current `ScriptFlowVariables.kt` interface text prepared by hand in the spike).
- Covers: AC-4

### FE-2 Generic core: an opaque per-editor context and a "context documents" step
- Repo/module: `continuum-workbench/language-server-extension`, `src/common`, `src/browser`
- Files: `src/common/LanguageServerRegistration.ts`, `src/common/EditorContext.ts` (new), `src/browser/LanguageIntelligenceService.ts`, `src/browser/LanguageSession.ts`, `src/browser/ContextDocuments.ts` (new), `src/browser/DocumentSynchronizer.ts` (thin delegation), their specs
- Change (language-neutral names only):
  - `LanguageServerRegistration<C = unknown>` gains `parseContext(raw: unknown): C | undefined` (validates and normalises; undefined = unusable), `contextDocuments(context: C): readonly ContextDocument[]` (`{ key, text }` hidden documents the server needs), `virtualDocuments.plan(userText, documentKey, context?)` (context-aware; `documentKey` signature stays compatible) and `diagnosticFilter` as `readonly rules[] | (context) => rules[]`. Registrations that do not use a context keep working unchanged.
  - `attach(model, languageId, registrationId?, rawContext?)`: when the registration has `parseContext` and it returns undefined for the given raw value (including `undefined` = "nothing reported") the service returns `undefined` (plain editor, Q-4/D-4). Registrations without `parseContext` ignore the context.
  - `ContextDocuments` (single responsibility: ref-counted lifecycle of context documents per registration, keyed by `ctx<contentHash>` of the text; identical contexts share one; opens each before the first user document that needs it, closes when the last holder detaches, reopens all open ones after a server restart/reconnect; diagnostics on them are dropped, they are never in a `PositionMapper`). `DocumentSynchronizer` only delegates to it. If FE-1 says `PATH=header-fold`, this unit is NOT built; instead `plan` receives the declarations (see FE-4) and FE-2 shrinks to `parseContext` + plan/filter context plumbing.
  - The hash is a small deterministic content hash (e.g. FNV-1a/`sha-1` via existing helpers, hex, 12 chars); collisions are treated as equal content only if the text matches (compare text, else suffix a counter).
- Unit tests: `ContextDocuments.spec.ts` (share/ref-count/close, open order before the user document, reopen after restart, two contexts isolated, diagnostics on context URIs dropped); `LanguageIntelligenceService.spec.ts` (no context ⇒ `undefined`, malformed ⇒ `undefined`, registration without `parseContext` unaffected); existing specs updated for the new optional parameter.
- Docs: doc comments in `LanguageServerRegistration.ts` (replace the "seed files" prose: seed files remain a generic capability but the Kotlin registration uses none).
- Depends on: FE-1 (path decision)
- Covers: AC-4, AC-8, AC-9

### FE-3 Backend bridge: context documents pass the guard, the private workspace is seed-free
- Repo/module: `continuum-workbench/language-server-extension`, `src/node`, `src/common/LspProtocolPaths.ts`
- Files: `src/common/LspProtocolPaths.ts` (only if `isAllowedDocumentUri`/key rules need `ctx<hash>` keys), `src/node/ClientMessageGuard.ts` (+spec), `src/node/VirtualUriTranslator.ts` (+spec), `src/node/PrivateWorkspace.ts` (+spec) , `src/node/OpenDocuments.ts`/multiplexer only if the per-channel document cleanup must close context documents of a dropped channel
- Change: context documents use the same `continuum-script:/ctx<hash>.kt` scheme, so the allow-list must accept exactly `[A-Za-z0-9_-]+` keys and still reject every other scheme, path traversal, and `file:`; verify (and spec) that a channel that disconnects releases its context documents on the server (no leak after the editor closes), and that `serverVersion` generation applies to them like any document. Empty `seedFiles` is the accepted state for `kotlin-script`. Skip the task body if FE-1 chose `header-fold` (then only a spec asserting the guard is unchanged remains).
- Unit tests: guard accepts `continuum-script:/ctxAB12.kt`, rejects `file:///etc/passwd`, `continuum-script:/../x.kt`, `continuum-script:/a/b.kt`; translator maps a context URI into the private directory; disconnect closes context docs.
- Docs: none (FE-7).
- Depends on: FE-2
- Covers: AC-9, AC-8

### FE-4 Kotlin context parser (`KotlinScriptContext`)
- Repo/module: `continuum-workbench/language-server-extension`, `src/kotlin`
- Files: `src/kotlin/KotlinScriptContext.ts` (new), `src/kotlin/KotlinScriptContext.spec.ts` (new)
- Change: single responsibility: turn the raw `options.scriptContext` into a validated `KotlinScriptContext { bindings: {name,type}[], declarations: string, contextKey }` or `undefined`. Rules: object; `language === 'kotlin'`; `bindings` non-empty array of `{name: /^[A-Za-z_][A-Za-z0-9_]*$/, type: single-line non-empty string without `;`/braces/`=` control characters}`, unique names; `declarations` a string with no `package`/`import` line at line start; whole JSON ≤ 64 KB; on rejection `console.warn` once with the reason (never throws, never logs the declarations). No names of any feature class appear in this file (spec fixtures use synthetic names such as `Counter`, `acc`, `ctx`).
- Unit tests: valid; each rejection above; oversize; `__proto__`/non-plain objects; non-string types; stable `contextKey` for equal content.
- Docs: none.
- Depends on: — (pure; may start with the contract above) — Can start now.
- Covers: AC-7, AC-6

### FE-5 Kotlin prelude and registration built from the reported context
- Repo/module: `continuum-workbench/language-server-extension`, `src/kotlin`
- Files: `src/kotlin/KotlinScriptPrelude.ts` (rewrite), `KotlinScriptPrelude.spec.ts`, `src/kotlin/KotlinScriptRegistration.ts`, `KotlinScriptRegistration.spec.ts` (new)
- Change:
  - Delete `CONTEXT_PACKAGE`, `CONTEXT_FILE_NAME`, `SCRIPT_BINDING_NAMES`, `FLOW_VARIABLE_MEMBERS`, `CONTEXT_FILE_SOURCE` and the `ScriptFlowVariables` import.
  - `planScriptDocument(userText, documentKey, context)` keeps the leading-imports placement, the key-sanitised wrapper name and the closing `}` but emits `import continuum.<contextKey>.*` and `fun continuumScript<key>(<name>: <type>, …): Any? = run {` from `context.bindings`. (Under `PATH=header-fold`, the hidden header additionally contains the declarations inside the wrapper shape chosen by FE-1 and a hidden-line count so `PositionMapper` stays correct.)
  - Registration: `workspace: { kind: 'private', seedFiles: {} }`; `parseContext` = FE-4 parser; `contextDocuments` = one document `{ key: context.contextKey, text: 'package continuum.<key>\n\n' + declarations }`; `diagnosticFilter` is built from the bindings: `^Parameter '(<escaped names joined by |>)' is never used` (names are identifier-validated, still regex-escaped).
  - Keep `KOTLIN_SCRIPT_REGISTRATION_ID`, editor language id and status texts untouched.
- Unit tests: prelude spec rewritten with synthetic bindings (`a: Int`, `b: List<String>`): parameter list, import line, imports-first placement, CRLF, `showTrailingErrorsOnLastUserLine`; registration spec: no seed files, filter hides "Parameter 'a' is never used" and not "Parameter 'zzz'" or a real unused variable, `contextDocuments` text starts with the package line and contains the declarations unchanged.
- Docs: doc comments only.
- Depends on: FE-2, FE-4
- Covers: AC-5, AC-6, AC-8

### FE-6 Dialog wiring: pass `options.scriptContext` to the language service
- Repo/module: `continuum-workbench/workflow-editor-extension`, `src/browser/components/node-dialog`, `src/browser/hooks`
- Files: `components/node-dialog/CodeEditorRenderer.tsx`, `hooks/useLanguageIntelligence.ts` (+ their specs, `LanguageIntelligenceFooter` only if it forwards props)
- Change: `CodeEditorRenderer` reads `props.uischema.options?.scriptContext` next to `language` and hands it, opaque and unvalidated, to `useLanguageIntelligence`, which passes it as the 4th argument of `client.attach`. A change of the context object (deep-equal by JSON string) re-attaches; no context ⇒ `attach` returns `undefined` ⇒ no footer, no chip (existing path). No Kotlin knowledge or validation in `workflow-editor-extension` (validation is the registration's `parseContext`). The typed text is only read, as before.
- Unit tests: hook spec: context forwarded to `attach`; undefined context forwarded as undefined; re-attach only when the serialised context changes; `onChange`/saved text unaffected.
- Docs: none (FE-7).
- Depends on: FE-2 (the `attach` signature; can mock against the planned signature earlier)
- Covers: AC-7, AC-10

### FE-7 Guard, docs, knowledge, release note for the workbench
- Repo/module: `continuum-workbench`
- Files: `language-server-extension/src/common/GenericityGuard.spec.ts`, `language-server-extension/README.md` (§ Kotlin, § registration contract), `continuum-workbench/AGENTS.md` (`language-server-extension/` row and the `workflow-editor-extension` text on `options`), `release_notes/RELEASE_NOTES_v<version>.md`, `.claude/knowledge/workbench.md`, `.claude/knowledge/graph.json`, `.claude/knowledge/change-log.md`
- Change:
  - `GenericityGuard.spec.ts`: keep every existing ban (`row`, `ScriptFlowVariables`, `flow.get` …) for generic code and add a new check scanning **all** of `language-server-extension/src` and `workflow-editor-extension/src` (non-spec files) for `ScriptFlowVariables`, `FLOW_VARIABLE_MEMBERS`, `SCRIPT_BINDING_NAMES`, `CONTEXT_FILE_SOURCE`, `ContinuumContext`; adjust the existing sample list (it currently expects `ScriptFlowVariables` to be matched by the bans, that stays as a test of the regex, not of the source). Check that the spec's own sources of tokens are excluded correctly.
  - Docs: replace the "mirrors the feature class / written to the private workspace / spec compares the two" statements with the dynamic model (node reports `options.scriptContext`; core opens context documents; plain editor when nothing is reported; where the shape is documented in `continuum-docs`).
  - Release notes: add to the file of the version being prepared (`0.0.16` unless its `release/0.0.16` tag exists; then bump or ask, per AGENTS.md) a "What's new" line and an **Upgrade notes** entry: workbench and feature-base must be updated together; with an older worker the Kotlin Script editor is plain (highlighting only) until the worker's feature-base is updated; with an older workbench nothing changes.
  - Knowledge graph: update page and graph nodes (new `kotlin-script-context`, `context-documents`; remove `kotlin-script-prelude` mirroring edge), change-log line.
- Unit tests: the guard spec itself.
- Depends on: FE-5, FE-6
- Covers: AC-5, AC-12

### FE-8 System tests: suites follow the dynamic model
- Repo/module: `continuum-system-tests`
- Files: `suites/ui/kotlin-lsp.mjs`, `suites/api/kotlin-lsp-bridge.mjs`, `lib/kotlin-script.mjs` (+ `test/kotlin-script.test.mjs`), `AGENTS.md` (the suite descriptions), README if it lists the groups
- Change:
  - `lib/kotlin-script.mjs`: helper `reportedContextFromFeatureSource()` that reads `continuum-feature-base/.../ScriptFlowVariables.kt` (sibling repo; env `FEATURE_BASE_DIR` override; SKIP with a reason when absent), strips the package line and returns the `scriptContext` object exactly as BE-2 reports it; unit-tested in `test/`.
  - `suites/ui/kotlin-lsp.mjs`: the `.cwf`/schema it copies from `KotlinScriptNodeModel.kt` now includes `options.scriptContext` from that helper (the suite stands in for the worker); the leak regexes keep `ScriptFlowVariables` only as "must not leak to the user's diagnostics" (lines ~585, ~644, ~1063: stay valid, comment updated: the name now comes from the reported context). New scenarios: `no-context` (node schema without `scriptContext` ⇒ plain editor, no chip, no markers, save works; AC-7), `bad-context` (malformed context ⇒ same, no page error), `twocontexts` (two nodes with different synthetic contexts, completion in each shows only its own members, no redeclaration diagnostics; AC-8). Existing `completion`, `valid`, `diagnostics`, `hover`, `save` double as AC-10.
  - `suites/api/kotlin-lsp-bridge.mjs`: the check around line ~798 (`val ctx = continuum.ScriptFlowVariables()` resolves because it was seeded) becomes "no seed: `continuum.ScriptFlowVariables` is **unresolved** without a context document, and resolves once a `continuum-script:/ctx<hash>.kt` document declaring it is open" ; new group `context`: open context + script ⇒ `flow.` completion with KDoc, hover, type error, valid silence (AC-4 on the real server); two contexts isolated; the guard rejects a non-virtual URI sent as a context document (`security`); closing the context document frees it (`leak`/`documents`). Update the `leak`/`documents` expectations that assumed a seed file in the private directory. Offline mode (`--offline`, `kotlin-lsp-image.mjs` copies this suite) must keep working: the new group needs no network.
  - `AGENTS.md`: add the new scenario/group names and the helper.
- Unit tests: `node --test test/kotlin-script.test.mjs` for the helper (package stripped, no import, bindings names).
- Docs: `continuum-system-tests/AGENTS.md`.
- Depends on: FE-5, FE-6, BE-2 (for the real shape); the helper and the bridge `context` group can be written after FE-1 against the spike result.
- Covers: AC-4, AC-7, AC-8, AC-9, AC-10

## Dependency graph
- BE-1 → BE-2 → BE-3
- FE-1 → FE-2 → FE-3, FE-2 → FE-5, FE-4 → FE-5, FE-2 → FE-6
- FE-5 + FE-6 → FE-7; FE-5 + FE-6 + BE-2 → FE-8
- Can start now: BE-1, FE-1, FE-4. All other tasks wait for the listed predecessors. No cycles; the BE and FE tracks only meet in FE-8 (and the final end-to-end browser run).
- Critical path: FE-1 → FE-2 → FE-5 → FE-7/FE-8. If FE-1 yields `PATH=header-fold`, FE-2's `ContextDocuments` and FE-3 drop out and FE-5 grows by the header-fold plan (net smaller overall).

## Test plan
| AC | Verifier | Where |
|---|---|---|
| AC-1 | backend-developer (unit) | `KotlinScriptReportedContextTest`, `ScriptContextReportTest` (feature-analytics); backend-system-tester: stack metadata fetch only if the stack is up |
| AC-2 | backend-developer | `ExecutionContextFlowVariablesTest`, `KotlinScriptNodeModelTest` |
| AC-3 | backend-developer | `KotlinScriptReportedContextTest` |
| AC-4 | frontend-developer (spike) → backend-system-tester | `.factory/CONTNM-180-dynamic-bindings/spike-context-documents.md`; `suites/api/kotlin-lsp-bridge.mjs` group `context` |
| AC-5 | frontend-developer; experts | `GenericityGuard.spec.ts`, `KotlinScriptRegistration.spec.ts`; review checklist: no feature API token in workbench source |
| AC-6 | frontend-developer; frontend-tester | `KotlinScriptPrelude.spec.ts`, `KotlinScriptRegistration.spec.ts`; `kotlin-lsp.mjs` `valid` |
| AC-7 | frontend-developer; frontend-tester | `KotlinScriptContext.spec.ts`, `LanguageIntelligenceService.spec.ts`, hook spec; `kotlin-lsp.mjs` `no-context`, `bad-context` |
| AC-8 | frontend-developer; frontend-tester; backend-system-tester | `ContextDocuments.spec.ts`; `kotlin-lsp.mjs` `twocontexts`; bridge group `context` |
| AC-9 | frontend-developer; backend-system-tester | `ClientMessageGuard.spec.ts`, `VirtualUriTranslator.spec.ts`, `PrivateWorkspace` spec; bridge groups `security`, `documents`, `leak` |
| AC-10 | frontend-tester (real browser) | `kotlin-lsp.mjs` `completion`, `valid`, `diagnostics`, `hover`, `save` |
| AC-11 | backend-developer; experts | AC-1/AC-3 tests; review: no member list in the workbench |
| AC-12 | experts (docs/release-note review) | `continuum-docs` pages, workbench README/AGENTS, release note |

Commands: feature-base `./gradlew :features:continuum-feature-analytics:test` (JDK 21 via SDKMAN); workbench `yarn workspace @continuum/language-server-extension test`, `yarn workspace @continuum/workflow-editor-extension test` (Node 24 via `bash -ic`); system tests `node --test test/` in `continuum-system-tests`.

## Not verifiable locally
- Real browser dialog run (AC-10, `kotlin-lsp.mjs`) needs a development (non-minified) workbench build and a running workbench; none is running now, and puppeteer's bundled Chromium is the only browser. Verifiable only if the tester can build and start the workbench.
- The published feature image and an end-to-end worker → api-server → dialog metadata path (a node registered with the real `scriptContext`) need the full stack (api-server/worker not running); locally the suites stand in for the worker with the metadata built from the real source file.
- `kotlin-lsp-image.mjs` (production image) needs Docker image rebuild; not required by this change except that the suite file it copies must keep working offline.
- No dependency change is planned, so no `yarn.lock` regeneration; `openapi-generator` is missing but no OpenAPI/client change is needed (nothing in platform-core changes).
- Whether the convention plugin `org.projectcontinuum.feature` lets the module extend `processResources` is NOT VERIFIED until BE-1 runs it.

## Changelog
- 2026-11-28: initial plan (autopilot defaults Q-1..Q-5).

# Nodes report their script bindings; the workbench builds the Kotlin editor context from them
Status: READY FOR PLANNING
(Autopilot: the user is away. Every open question below carries a recommended default, marked **[DEFAULT]**; planning proceeds with those. All are listed in "Decisions taken on autopilot" for the final report.)

## User story
As a node author I want a node to report its own script API (the names it binds in the script and the declarations of their types) as part of its node metadata, so that the workbench's script editor offers completion, hover and diagnostics from what the node reports. The workbench then holds no copy of a feature's API, and a change to `ScriptFlowVariables` reaches the editor without a workbench release.

Visible outcome: in the Kotlin Script node dialog `flow.` still completes `get/set/all` with their KDoc and a wrong type still gets a diagnostic, but the workbench source no longer contains `ScriptFlowVariables`, `row` or `flow` anywhere.

## Context — what exists today
Follow-up of CONTNM-180 (see `../CONTNM-180/REPORT.md`, `01-requirements.md`, `02-plan.md`, knowledge page `workbench.md` § language-server-extension).

Workbench (the hardcoded copy to remove):
- `continuum-workbench/language-server-extension/src/kotlin/KotlinScriptPrelude.ts`: `SCRIPT_BINDING_NAMES = ['row','flow']`, `FLOW_VARIABLE_MEMBERS`, `CONTEXT_FILE_SOURCE` (a hand-written copy of `ScriptFlowVariables` with stub bodies), and `planScriptDocument`, which emits the hidden header `import continuum.ScriptFlowVariables` + `fun continuumScript<key>(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {` and a trailing `}`. `KotlinScriptPrelude.spec.ts` tests it.
- `src/kotlin/KotlinScriptRegistration.ts`: registration `kotlin-script` with `workspace: { kind: 'private', seedFiles: { 'ContinuumContext.kt': … } }` and a diagnostic filter for "Parameter 'row|flow' is never used".
- `src/node/PrivateWorkspace.ts`: seed files are written **once, before the server starts**, and the directory is rebuilt on each start. One server per registration is shared by all editors (lazy start, idle stop). So today's context is static per registration, not per node.
- `src/common/LanguageServerRegistration.ts`: generic contract; `GenericityGuard.spec.ts` bans language tokens in generic code (the extension must stay language-neutral).
- `src/browser/LanguageIntelligenceService.ts`: `attach(model, languageId, registrationId?)`: knows nothing about the node.
- `workflow-editor-extension/.../node-dialog/CodeEditorRenderer.tsx`: reads `props.uischema.options` (`format`, `language`, `rows`), maps the language via `dialogEditorLanguage`, renders `LanguageIntelligenceFooter` → `hooks/useLanguageIntelligence.ts` → `client.attach(model, languageId)`. The renderer receives only the jsonforms control props, so the UI-schema element's `options` is the one node-supplied channel that already reaches it; no node-level metadata is passed in.

Feature base (the real API):
- `continuum-feature-base/features/continuum-feature-analytics/src/main/kotlin/.../node/ScriptFlowVariables.kt`: `class ScriptFlowVariables(private val executionContext: ExecutionContext)` with `get/set/all`; its KDoc says the workbench mirrors it.
- `KotlinScriptNodeModel.kt`: constants `ROW_BINDING="row"`, `FLOW_BINDING="flow"`; binds `row` (`Map<String, Any>`) and `flow` per row; `propertiesSchema` (property `script`, free text), `uiSchema` control with `options: {format: code, language: kotlin, rows: 15}`; `metadata = NodeData(... propertiesSchema, propertiesUISchema)`.
- `KotlinScriptBindingsContractTest.kt`: reflection test pinning the public members, written to remind a developer to edit the TS prelude, i.e. drift protection by a human, across two repos.
- Module build: `features/continuum-feature-analytics/build.gradle.kts` (plugin `org.projectcontinuum.feature`).

Platform core (how node metadata travels):
- `continuum-commons/.../model/ContinuumWorkflowModel.kt` `NodeData`: `propertiesSchema: Map<String, Any>` (JSON Schema draft 7), `propertiesUISchema: Map<String, Any>` ("JSONForms UI schema the workbench renders the property dialog from. **Not used by the backend**"). Both are free-form maps: they are stored and served by the node registry/explorer unchanged (`api-server/.../NodeExplorerService.kt`, `NodeExplorerTreeItem.kt`) and `NodeData` has `@JsonIgnoreProperties(ignoreUnknown = true)`.
- `propertiesSchema` IS used by the backend: `WorkflowPropertiesValidator`/`ValidationHelper` (networknt json-schema-validator 3.0.0, draft 7, `PropertyRules` checks property names) and by the MCP node tools (`ContinuumNodeMcpTools`), which hand the schema to LLM clients.

## Feasibility
| Part | Verdict | Evidence | Notes |
|---|---|---|---|
| A. Node reports a script context in its metadata | FEASIBLE | `NodeData.propertiesUISchema` / `propertiesSchema` are open `Map<String, Any>` end to end | No platform-core or OpenAPI change if it rides in an existing map. A new top-level `NodeData` field would touch commons, registry persistence, `openapi` contract, regenerated workbench clients (`openapi-generator` is missing locally → NOT VERIFIED) and is not needed. |
| B. Declared once in Kotlin so it cannot drift from the real class | FEASIBLE WITH CHANGES | `ScriptFlowVariables` today is a concrete class with an `ExecutionContext` dependency and bodies | See option analysis: split into a dependency-free API interface (whose source file is the declaration) and the implementation. |
| C. Workbench uses the reported context dynamically | FEASIBLE WITH CHANGES | seed file is static per server start (`PrivateWorkspace.ts`), `attach` has no context parameter, plan function has no context parameter | Needs a generic "context documents" capability in the language-server core: the client opens the node's declarations as extra hidden documents (same `didOpen` path as the script document) instead of a start-time seed file. Core stays opaque and language-neutral; only `src/kotlin` knows Kotlin. |
| D. Older workers report nothing / compatibility | FEASIBLE | maps are optional; ignore-unknown on `NodeData` | Without a reported context the Kotlin editor must not guess; see Q-4. Older workbench + newer worker: the extra option is ignored by jsonforms. |
| E. Remove the hardcoded copy | FEASIBLE | `KotlinScriptPrelude.ts` constants, `ContinuumContext.kt` seed, `KotlinScriptPrelude.spec.ts` | `planScriptDocument` stays (the wrapper function shape is Kotlin-engine knowledge), but its parameter list is generated from the reported bindings. |

### Options for the shape of the reported context
1. **Declarations as Kotlin source + structured binding list [DEFAULT].** The node reports `{ language: "kotlin", bindings: [{name:"row", type:"Map<String, Any>"}, {name:"flow", type:"ScriptFlowVariables"}], declarations: "<Kotlin source>" }`. The server is handed real Kotlin, so KDoc, overloads, nullability and generics are exact with no translation layer; the workbench needs no model of Kotlin API structure. Cost: the payload is language-specific text (declared as such by `language`), a few hundred bytes to 2 KB per node.
2. **Purely structured descriptions** (members with name, parameters, return type, doc). Language-neutral on the wire, but the workbench must render them into Kotlin: that is a hardcoded Kotlin generator (type syntax, generics, nullability, KDoc), a new schema to version, and it cannot express arbitrary classes. Higher cost, lower fidelity. Rejected.
3. **Source string only, no binding list.** The workbench would not know the names/types to put into the wrapper function, so it would hardcode `row`/`flow` again. Rejected.

### Options for where the context lives in the metadata
a. **UI-schema control options of the `script` control [DEFAULT]**, e.g. `options: { format: "code", language: "kotlin", rows: 15, scriptContext: { … } }`. It is a presentation concern, `propertiesUISchema` is documented as "not used by the backend", so neither the property validator nor the MCP tools see it; and `CodeEditorRenderer` already reads `options.language` from exactly this place, so each code control carries its own context (a node with two scripts could have two). No platform-core change.
b. **Vendor keyword in `propertiesSchema`** on the `script` property (e.g. `"x-continuum-script-context"`), as the user literally suggested. Semantically close ("the node's API"), but the schema is validated by networknt (unknown-keyword behaviour of 3.0.0 NOT VERIFIED, needs a spec), and it would be sent to LLM clients by the MCP node tools, bloating their context. The workbench dialog would also have to pass the schema subtree down to the renderer (jsonforms gives `props.schema`, so possible). Fallback if (a) is rejected.
c. **New field on `NodeData`**: cross-repo contract change, see part A. Rejected for this size of need.

### Where it is declared in Kotlin (no drift)
- **[DEFAULT]** Extract the pure API into `interface ScriptFlowVariables` in its own file (no imports, KDoc on every member, `get/set/all`), and rename the current class to an implementation (`ExecutionContextFlowVariables(executionContext) : ScriptFlowVariables`). A Gradle `processResources` step in `continuum-feature-analytics/build.gradle.kts` copies that single `.kt` file onto the classpath as a resource; `KotlinScriptNodeModel` reads it and puts it in `scriptContext.declarations`. The reported text is therefore the compiled file itself: it cannot drift. The binding names come from `ROW_BINDING`/`FLOW_BINDING` already used by `execute`, and their types are named once in the node (a test checks that every binding type resolves to a declaration or a Kotlin stdlib type). `KotlinScriptBindingsContractTest` becomes "the reported context equals the file, binds exactly what `execute` binds, and the implementation implements the interface"; the reminder comments about the TS prelude disappear. Caveat: the Gradle resource step is new build logic in the feature repo (NOT VERIFIED that the convention plugin `org.projectcontinuum.feature` leaves `processResources` free to extend; to be checked in planning).
- Alternative: keep the class, hand-write the declaration as a string constant in the node, with a contract test that compares it to the class by reflection (today's test, moved). Simple, no Gradle change, but drift is only caught by a test, not prevented, and a stub-vs-real mismatch is possible. Fallback if the Gradle step proves awkward.

## Scope
**In scope**
- Feature base (`continuum-feature-base`, analytics): interface/implementation split, resource wiring, `scriptContext` in the `script` control options, updated unit test(s).
- Workbench `language-server-extension`: remove `FLOW_VARIABLE_MEMBERS`, `SCRIPT_BINDING_NAMES`, `CONTEXT_FILE_SOURCE`, the `ContinuumContext.kt` seed file and the `flow`/`ScriptFlowVariables` mention in the registration's diagnostic filter (generalise to "parameter <any binding name> is never used", built from the reported bindings); generic core gets an opaque per-editor context passed from `attach` into the registration, and a generic "context documents" step (hidden documents opened before the user's document, keyed by content hash so identical contexts share one document and different nodes cannot clash). `GenericityGuard` stays green; Kotlin-specific work only in `src/kotlin`.
- Workbench `workflow-editor-extension`: `CodeEditorRenderer` / `useLanguageIntelligence` read `options.scriptContext` and pass it on; validate its shape (size cap, string types, identifier-only binding names) and ignore a malformed one (editor stays plain).
- Update `KotlinScriptPrelude` spec, registration specs, a GenericityGuard check that the workbench source no longer contains the feature API, knowledge pages, docs for node authors (how a node reports its script context; the feature-development guide in `continuum-docs` is the place, NOT located yet), release note "Upgrade notes" (older workers: no script intelligence until the feature-base is updated).

**Out of scope**
- Any platform-core / OpenAPI / registry change (none needed with option a).
- Other languages or other nodes (the shape is generic, only Kotlin Script reports it now; no new node gets it).
- Real `.kt` file editing (`fwcd.kotlin`, user workspace route) is unchanged.
- Making the script itself execute differently; the runtime bindings and `ScriptFlowVariables` behaviour are unchanged.
- Dependencies beyond the stdlib: a context may only reference types the server already knows (stdlib) plus what it declares itself.

**Assumptions (obvious default, no question)**
- The package line is added by the workbench (`package continuum.ctx<hash>`) and the declaration file must not contain one, so two nodes with different contexts never redeclare each other's classes.
- Node-supplied declarations are only ever read by the language server, never executed; they come from the trusted worker registry through the existing authenticated API.
- Size cap for a reported context: 64 KB; exceeding it disables intelligence for that editor with a console warning.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Dynamic context cannot be delivered with a start-time seed file | Core redesign more than a swap | Deliver it as extra hidden documents via `didOpen` through the existing document pipeline; the bridge already allows only `continuum-script:` URIs, so the URI allow-list and `VirtualUriTranslator` need a spec for context documents (security surface: URI guard must still reject everything else). |
| fwcd/Kotlin server resolves a second hidden document in the same private workspace only if it sees it as a source file | Completion would silently stop working | Spike first (the CONTNM-180 spike harness `.factory/CONTNM-180/spike/run-spike.mjs` can be reused): open a declarations document + a script document and check `flow.` completion, hover, and a type error. If this does not work, fall back to inlining the declarations into the script's hidden header inside an `object` wrapper (per-document, no cross-document dependency), at a cost of re-sending it per document. |
| Position mapping / hidden-line accounting grows (context lines are now hidden lines) | Wrong error positions | Context lives in its own document, not in the script's, so `PositionMapper` for the user document is unchanged; diagnostics from context documents are always dropped. |
| Old worker + new workbench (no context) | Editor loses intelligence that today works | Q-4 default: plain editor with no false errors; release note. Deploying workbench and feature base together is the normal path (same release train). |
| New worker + old workbench | None | Unknown UI-schema option is ignored. |
| Payload in every `uiSchema` fetch | Small bloat | ~1 KB; only the Kotlin Script node; cap 64 KB. |
| Gradle resource wiring fails in the convention plugin | Fall back to string constant + reflection test | See "Where it is declared". |
| `openapi-generator`, Docker image rebuild not needed; browser verification | none beyond those already in CONTNM-180 | NOT VERIFIED items from CONTNM-180 (real browser run) remain environment-dependent. |

## Size
**M** (about 2–3 days): small Kotlin change in feature-base (S); generic context-document capability, renderer/hook plumbing, registration rewrite and specs in the workbench (M); plus a short de-risking spike on how the Kotlin server sees a second document (could turn it into M+ if the fallback inlining is needed). No platform-core change.

Local verification: Gradle tests for feature-base and workbench specs are runnable (JDK 21 via SDKMAN; Node 24 in `bash -ic`). End-to-end against the real Kotlin server is runnable offline with the spike harness; a real browser dialog check and a published-feature-image check depend on the stack (api-server/workbench not running now) → NOT VERIFIED until run.

## Draft acceptance outcomes
1. Given the Kotlin Script node is registered by a worker with this change, When its metadata is fetched, Then the `script` control reports a script context with language "kotlin", bindings `row` and `flow` with their types, and declarations that equal the compiled `ScriptFlowVariables` API source file.
2. Given the dialog of that node is open, When the user types `flow.`, Then `get`, `set` and `all` are offered with the KDoc of the real API, and hover on `get` shows that KDoc.
3. Given the same dialog, When the user writes `val x: Int = flow.all()`, Then a type-mismatch diagnostic appears on that line, and a valid script (e.g. the node's default) shows no diagnostics, including no "parameter never used" warning for a script that uses only `row`.
4. Given a developer adds a member to the real flow-variables API, When the worker is rebuilt and the node re-registered, Then the editor offers the new member with no workbench change and no test in the workbench needs editing; and a build in which the reported declarations differ from the real API does not pass the feature-base tests.
5. Given the workbench source tree, When searched for `ScriptFlowVariables`, `FLOW_VARIABLE_MEMBERS` or the seed file `ContinuumContext.kt`, Then nothing is found (guard spec), and the generic language-server core still contains no language-specific names.
6. Given a worker that reports no script context (older feature-base), When the Kotlin Script dialog opens, Then the editor works as a plain code editor (highlighting only, no status chip, no false diagnostics), and saving the script is unaffected.
7. Given a reported context that is malformed or over the size cap, When the dialog opens, Then the editor stays plain and the workbench does not throw.
8. Given two Kotlin Script-like nodes with different contexts open one after the other on the same server, When completing in each, Then each sees only its own declarations and neither reports a redeclaration.
9. Given the script text, When the node is saved or run, Then the stored script is exactly what the user typed (no hidden lines), as before.

## Decisions
(none from the user yet; the autopilot defaults below were taken.)

## Decisions taken on autopilot (to be flagged in the final report)
- **D-1 Shape: Kotlin declarations source + structured bindings (option 1).**
- **D-2 Location: the `script` control's UI-schema `options.scriptContext` (option a)**, not a `propertiesSchema` keyword and not a new `NodeData` field. This deliberately differs from the literal wording "node properties or propertySchema": the schema is validated and shown to MCP/LLM clients, the UI schema is neither.
- **D-3 Drift-proofing: API interface in its own file shipped as a classpath resource and reported verbatim.**
- **D-4 No context reported → plain editor, no hardcoded fallback.**

## Open questions
All carry a default; planning continues without waiting.

**Q-1 Where should the node report its script API?**
- **(Recommended) In the UI-schema options of the script field**, next to the existing `language: kotlin` option the dialog already reads. No platform-core change; not validated and not sent to AI tool clients.
- In the node's `propertiesSchema` on the `script` property as a vendor keyword: closest to your wording, but it goes through the property validator (behaviour of unknown keywords to be proven) and into the schema shown to MCP clients.
- As a new top-level field of the node description: cleanest model but needs a platform-core contract change, OpenAPI regeneration and a coordinated release of all repos.

**Q-2 In what form should the API be reported?**
- **(Recommended) As Kotlin source text plus a short list of binding names and types.** Exact, with documentation comments, no translation in the workbench.
- As a structured description (members, parameters, return types) that the workbench turns into Kotlin: language-neutral on the wire, but it re-introduces a Kotlin generator in the workbench and cannot express arbitrary classes.

**Q-3 How is the reported source kept identical to the real `ScriptFlowVariables`?**
- **(Recommended) Split the class into an API interface (own file, no dependencies) and an implementation; the build ships the interface's own source file and the node reports it.** Drift is impossible by construction.
- Keep the class as is and a hand-written declaration string in the node, with a reflection test that fails on drift: no build change, but drift is caught, not prevented.

**Q-4 What should the editor do when the node reports no API (an older feature-base)?**
- **(Recommended) Behave as a plain code editor: highlighting only, no completion, no error squiggles.** No wrong errors and nothing hardcoded in the workbench.
- Keep a built-in copy of today's `row`/`flow` declarations as fallback for old workers: intelligence still works, but it brings back exactly the hardcoded copy you want removed.

**Q-5 If a second hidden document cannot be used by the Kotlin server (to be shown by the first spike), how is the context delivered?**
- **(Recommended) Fold the declarations into each script's hidden header inside a wrapper object.** Works with one document, a little more text sent per edit session.
- Seed the declarations into the server's workspace at connection time and restart the server when a different context appears: costs a restart (several seconds) whenever contexts change.

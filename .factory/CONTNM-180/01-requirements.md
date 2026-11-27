# Kotlin language-server support in the workbench (file editor + Kotlin Script node)
Status: READY FOR PLANNING

## User story
As a workflow author and node developer I want Kotlin code intelligence (completion, hover, diagnostics, go-to-definition) in the Continuum workbench — for `.kt`/`.kts` files in the file editor **and** for the script of a Kotlin Script node — so that I see errors and get suggestions before I run a workflow.

User-visible outcome: typing in a Kotlin Script node's editor shows completion for `row`, `flow.get/set/all`, Kotlin stdlib; mistakes are underlined; `.kt` files opened in the workbench do the same.

## Context — what exists today
- Workbench is a **Theia 1.74.1 browser app** (`continuum-workbench/continuum-workbench/package.json`, `theia.target: browser`). It already ships `@theia/plugin-ext` + `@theia/plugin-ext-vscode` (the VS Code extension host, used for git) and `@theia/monaco`. Plugins load from `plugins/` (`theiaPlugins` → `yarn download:plugins`); only `vscode.git` and `vscode.git-base` today. `@theia/ovsx-client` is installed as a transitive dependency; no Extensions view/marketplace UI is wired (NOT VERIFIED whether `@theia/vsx-registry` is absent: it is not in `node_modules/@theia`).
- **No LSP code anywhere**: no `monaco-languageclient`, `vscode-ws-jsonrpc` or `@theia/languages`. Present only: `vscode-jsonrpc`, `vscode-languageserver-protocol/-types/-textdocument` (transitive). No Kotlin extension in `plugins/`.
- Kotlin today = **syntax highlighting only**: `workflow-editor-extension/src/browser/language/MonacoLanguageRegistration.ts` registers Monarch grammars from `monaco-editor/esm/vs/basic-languages/*`.
- **The Kotlin Script node editor** is the JSONForms `CodeEditorRenderer.tsx` (`workflow-editor-extension/src/browser/components/node-dialog/`) → `components/monaco/MonacoEditorWrapper.tsx`, which calls the **standalone** `monaco.editor.create(container, {value, language,…})` (monaco taken from `useMUIThemeStore`). It is a plain in-memory model inside a React dialog, **not a Theia editor and not backed by a file URI**. Consequences: a VS Code extension (even if installed) never sees this editor, because the extension host only knows documents opened through Theia's editor manager. Language intelligence there must be attached to the Monaco model directly. The same renderer is used by other nodes with a `code` format (Rest, CreateTable, Claude agent — languages other than Kotlin possible; default language is `kotlin`).
- **Script contract** (`continuum-feature-base/.../analytics/node/KotlinScriptNodeModel.kt`, `ScriptFlowVariables.kt`): a script is a **JSR-223 expression evaluated per row**, no `package`/`class` wrapper. Bindings put in by the node: `row` (a `Map<String, Any?>`-like row, read via `reader.read()`), `flow` (`ScriptFlowVariables`: `get(name): Any?`, `set(name, value)`, `all(): Map<String, Any>`). The last expression is the result (`script_result`). Runtime engine: `kotlin-scripting-jsr223` 2.2.21 + `kotlin-compiler-embeddable` (feature-analytics `build.gradle.kts`). The node's JSON schema description already tells users about `row` and `flow`.
  A language server analysing this text as a plain `.kt` file would flag `row` and `flow` as **unresolved references** and complain about top-level expressions — so the script needs a synthetic context (a prelude declaring `val row: Map<String, Any?>` and `val flow: ScriptFlowVariables`, hidden from the user, with diagnostics line numbers shifted). Exact declared type of `row` must be confirmed from `NodeInputReader.read()`.
- Dev/runtime: Dockerfile production stage (`node:24-slim`) has **no JDK**; dev machine has JDK 21 (SDKMAN, per Local policy). Backend runs in the pod/container as user `continuum`, `/home/continuum` is a PVC.

## How the official Theia IDE does Kotlin (and what is feasible here)
- As far as I know, the Theia IDE / Blueprint ships **no built-in Kotlin language server**; Kotlin comes from installing a VS Code extension from Open VSX (e.g. `fwcd.kotlin`, which downloads/launches the *kotlin-language-server* and needs a JDK; or JetBrains' newer *kotlin-lsp*, a standalone JVM server, early/preview quality). NOT VERIFIED: I could not browse upstream here; confirm before designing.
- Option "extension in the file editor" therefore equals "add the extension to `theiaPlugins` + a JDK in the image" — cheap, but works **only for files** in the file editor, not for the node dialog.
- For the node dialog the only route is a **language-client bridge**: a Theia backend contribution (`MessagingService`/`BackendApplicationContribution`) spawns the Kotlin LS process and relays JSON-RPC over a Theia WebSocket channel; the frontend wires it to the standalone Monaco model with `monaco-languageclient` (new dependency; must match Theia's Monaco 1.108 / `@theia/monaco-editor-core` — version compatibility is the main technical unknown) or a thin hand-written adapter registering Monaco providers (completion/hover/diagnostics) over `vscode-jsonrpc`.
- Kotlin LSes are **heavy**: ~0.5–1.5 GB RAM, slow first start (minutes for indexing/stdlib), one JVM process per workspace/session. The classpath it needs for scripts (kotlin-stdlib, `ScriptFlowVariables` source/jar, row type) must be available to it.

## Feasibility
| Part | Verdict | Evidence | Notes |
|---|---|---|---|
| A. Kotlin LS for `.kt`/`.kts` in the file editor | FEASIBLE | `plugin-ext-vscode` + `theiaPlugins` already used for git | Add an Open VSX Kotlin extension (`.vsix` pinned like git) + JDK 21 in image. Quality depends on extension; `.kts` support in fwcd server is partial. Works in browser Theia only if the extension runs in the backend extension host (it does). |
| B. LSP features in the Kotlin Script node editor | FEASIBLE WITH CHANGES | `CodeEditorRenderer.tsx`, `MonacoEditorWrapper.tsx:32` (standalone model, no URI) | Needs own backend LS bridge + frontend client; model must get a (virtual) URI; script wrapped with a prelude for `row`/`flow`. Largest part of the work. |
| C. Script bindings known to the LS (`row`, `flow`) | FEASIBLE WITH CHANGES | `KotlinScriptNodeModel.kt` (`bindings.put("row")`,`put("flow")`), `ScriptFlowVariables.kt` | Needs a synthetic prelude file (or a `.kts` + script-definition with implicit receivers/properties) kept in sync with the node; drift risk. Single source of truth should live in one place (e.g. a resource shared by node docs and workbench). |
| D. Typed `row` columns / upstream flow variables | NOT FEASIBLE AS STATED (for v1) | Row columns are only known at runtime; flow variable names mirror `common/FlowVariables.ts` | Treat `row` as `Map<String, Any?>` and `flow.get` as `Any?`. Optional later: suggest known flow-variable names. |
| E. Runtime/packaging (JDK, LS binary, offline) | FEASIBLE WITH CHANGES | `Dockerfile` has no JDK; builder pulls vsix at build time | Add a JRE 21 (~200 MB) and the LS distribution to the image (downloaded at build, pinned + checksummed, not at runtime — pods may be offline). Image grows; startup memory grows. |
| F. Multi-tenancy / security | FEASIBLE WITH CHANGES | Workbench pod is per user (`/home/continuum`); `x-continuum-user-id` isolation is for the platform APIs | LS process runs inside the user's own workbench pod, so no cross-tenant sharing; limit to one process per backend, cap memory (`-Xmx`), do not give the node-dialog LS the user's whole workspace unless needed, validate the document URI scheme. No new platform API. |
| G. API / contract impact | none | — | No OpenAPI change, no `@continuum/core` enum, no Avro/Postgres. |
| H. Upgrade impact | small | — | Workbench release note ("Upgrade notes": image now contains JRE + LS; higher memory request; charts may need a larger pod memory limit → `continuum-charts` follow-up). |

## Environment limits for verification
- JDK 21, Node 24, Yarn, Docker, network (npm, Maven Central, GitHub) are available (`environment.md`) → the LS can be downloaded and run locally and a headless-browser check (puppeteer present; Playwright missing) is possible.
- `yarn install` for a new dependency must also update `yarn.lock` (CI `--frozen-lockfile`); network is reachable here, so feasible.
- Docker image build of the workbench and a real cluster/PVC behaviour: not verified locally unless the image is built; Open VSX reachability from the end-user's pod is NOT VERIFIED (pin and bundle at build time to avoid it).
- No Kotlin LS is installed locally; its actual startup time/quality on a bare script is unknown until a spike.

## Options (user must choose scope — see Q-1)
1. **File editor + Script node, shared server (recommended).** Install a Kotlin LS once in the backend; the Open VSX extension serves `.kt/.kts` files; a small Theia backend bridge + frontend Monaco adapter serves the node dialog with a hidden prelude. Result: both asked places work; size **L**; risk: Monaco/`monaco-languageclient` version fit, LS startup time, memory.
2. **File editor only (extension).** Add the extension + JDK. Size **S–M**; result: `.kt` files only, does **not** satisfy the user's addition for the node dialog.
3. **Script node only, lightweight (no JVM).** Do not run a real LS; use Monaco's built-in providers plus static completion items for `row`/`flow` and the stdlib. Size **S–M**; result: completion of `flow.`/`row`, but no real type-checking/diagnostics; no JDK in image. Gives partial value fast, a possible first step of option 1.
4. **Script node diagnostics via the platform** (backend compiles script with the same engine as the runtime, returns errors) — new API/OpenAPI, accurate to runtime, but no completion/hover and each check costs a compile; size **M–L**; not LSP.

Recommendation: option 1, delivered in two steps — first the shared LS + bridge with the Script node (the stated priority), then the file editor extension — after a short **spike** proving that a chosen Kotlin LS can analyse a prelude+script document and respond in acceptable time.

## Scope
**In scope (option 1):** Kotlin LS bundled in the workbench image and dev setup; backend bridge (lifecycle: lazy start on first Kotlin editor, idle shutdown, restart on crash, memory cap); frontend LSP client for the node-dialog Monaco editor (completion, hover, signature help, diagnostics; go-to-definition where cheap); synthetic prelude for `row`/`flow` hidden from the user with correct diagnostic positions; Kotlin extension for `.kt/.kts` files; graceful fallback to today's highlighting-only editor if the LS is down/unavailable (with a visible status); release notes, workbench README/AGENTS.md/docs ("Upgrade notes"); unit tests for prelude/position mapping, browser test of completion in the node dialog.
**Out of scope:** other languages (Python, Java …) and the other `code`-format nodes (RestNode etc. keep today's behaviour; design the bridge so it is reusable); typed `row` columns and flow-variable name suggestions; refactoring/rename/code actions; debugging; changes to how the script is executed in the feature-base node; Gradle/Maven project import in the workspace.
**Assumptions (obvious default):** one LS process per workbench backend (per user pod); Kotlin 2.2 language level matching the node runtime (2.2.21); the user's current Theia version stays 1.74.1; no change to the platform API.

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Kotlin LS too slow/heavy (cold start of minutes, ~1 GB RAM) in small pods | Poor UX, pod OOM | Lazy start, `-Xmx` cap, spike with measurements first, chart memory follow-up, fallback to highlighting-only |
| Kotlin LS poorly supports scripts / no `row`,`flow` resolution | Red squiggles on valid scripts | Prelude approach; filter known false-positive diagnostics; spike decides LS choice |
| `monaco-languageclient` incompatible with Theia's Monaco 1.108 | Rework | Use thin custom adapter over `vscode-jsonrpc`; decided in spike |
| Prelude drifts from `KotlinScriptNodeModel` bindings | Wrong completions/diagnostics | Single shared definition + a unit test/doc pointer in both places |
| JRE + LS bloat image, offline pods, supply chain | Bigger/slower image, security | Pin versions + checksum at build, bundle in image, no runtime download |
| LS exposes the user's filesystem | Information leak across files in same pod | Same pod = same user; restrict workspace roots handed to the LS |
| Unreleased/preview JetBrains LS or archived fwcd project lacks maintenance | Long-term support | Choose via spike; keep the LS replaceable behind the bridge |

## Size
**L** for option 1 (S–M extension-only part, M–L bridge + prelude + packaging + tests). Spike: S.

## Draft acceptance outcomes
- Given a Kotlin Script node dialog is open, when I type `flow.` then completion lists `get`, `set`, `all`.
- Given the script `row["a"]?.toString() + flow.get("x")`, when the LS is ready, then no "unresolved reference" is shown for `row` or `flow`.
- Given the script `val x: Int = "a"`, then an error underline appears on the offending part and its line/column match the text the user sees (prelude does not shift positions).
- Given I hover `flow.set`, then its documentation/signature is shown.
- Given the LS is not started yet or crashed, when I edit a script, then the editor still works with syntax highlighting, a status shows "language server unavailable/starting", and saving the node is not blocked.
- Given a `.kt` or `.kts` file is opened in the file editor, then completion, hover and diagnostics are provided.
- Given two nodes are open in dialogs, then each keeps its own diagnostics (no cross-talk) and closing a dialog frees its document.
- Given the workbench image is started with no internet access, then Kotlin intelligence still works.
- Given I save the script, then the stored `script` property is exactly what I typed (the prelude is never saved).
- Given the workbench runs in a normal-size pod, then memory stays within the agreed limit with the LS running.

## Decisions
- **D-1 Scope:** real Kotlin language server for the Kotlin Script node editor AND `.kt/.kts` files, after a short spike (option 1; size L).
- **D-2 Server choice:** the spike decides between `fwcd/kotlin-language-server` and JetBrains `kotlin-lsp`; result recorded; server stays replaceable behind the bridge.
- **D-3 Packaging:** JRE 21 + server bundled in the workbench image at build time (pinned versions + checksums, no runtime download), lazy start; chart memory raise is a `continuum-charts` follow-up.
- **D-4 Visibility:** node-dialog editor sees only the script + `row` + `flow` + Kotlin stdlib (no workspace files).
- **D-5 Fallback:** if the LS is starting/unavailable the editor behaves as today, shows a small status, never blocks saving.
- **D-6 Generality:** generic bridge (language id -> server command); only Kotlin is delivered; other code-format nodes unchanged. The user may later add LSP for **CEL** (Loop node conditions): the bridge, the frontend Monaco/LSP adapter and the document-context (prelude/virtual URI) mechanism must be language-agnostic and pluggable (per-language: server command, virtual-document prelude/position mapping, status text) so CEL can plug in without rework. **CEL itself is out of scope** (no CEL server, no Loop node change); the planner should add an acceptance check that nothing in the bridge/adapter is Kotlin-hardcoded outside a Kotlin language registration.

## Open questions
None.

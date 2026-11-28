# Frontend review — CONTNM-180-dynamic-bindings

## Round 1

Scope: continuum-workbench (language-server-extension, workflow-editor-extension) and continuum-system-tests, checked against `02-plan.md` and `04-frontend-dev.md` (rounds 1 and 1b). `03-backend-dev.md` does not exist; I compared the wire shape against the real backend (`continuum-feature-base/.../ScriptContextReport.kt`, `KotlinScriptNodeModel.kt`: `options.scriptContext` = `{language:'kotlin', bindings:[{name,type}…], declarations}` with the package line stripped and no imports). It matches what `parseKotlinScriptContext` accepts.

Verified by running (no build, no workbench): language-server-extension `tsc -p tsconfig.test.json` plus `node --test` 278/278 pass; workflow-editor-extension 197/197 pass; continuum-system-tests `node --test` 175/175 pass. The dev's counts are confirmed. No generated client, `package.json` or `yarn.lock` change in the workbench, so no regeneration is needed.

### What I checked and found sound
- **Generic core stays language-free.** `EditorContext.ts`, `ContextDocuments.ts`, `LanguageServerRegistration<C>` and `EditorContextKey.ts` never look inside the context. `GenericityGuard.spec.ts` now also scans the pass-through files and fails on the old mirrored API.
- **Validation of the reported context** (`KotlinScriptContext.ts`): plain-object check (prototype and `__proto__`), 64 KiB cap, at most 32 bindings, identifier and hard-keyword check, single-line types (`;{}=`, comments and control characters rejected), duplicates rejected, `package`/`import` lines rejected in the declarations, warnings carry no declarations. Never throws. Anything unusable gives a plain editor, because `attach` returns `undefined` and no connection is acquired.
- **Context ordering.** The context document is opened and acknowledged by an awaited `documentSymbol` before the script, with a timeout fallback (`ContextDocuments` + `DocumentSynchronizer.contextReady`). Generation counters make wire loss, re-open and dispose race-safe. After a lost wire, `entry.ready` is replaced and the synchronizer re-asks. The subscription order (contexts before synchronizer) is correct.
- **Isolation.** The namespace is core-owned (connection scope + content digest + collision index), so equal contexts in two tabs do not clash. Entries are reference-counted and closed on the last release or on dispose.
- **React** (`useLanguageIntelligence`): effect dependencies include `contextKey` (a string), so the editor re-attaches only when the JSON content changes. Cleanup disposes the session. `editorContextFromKey` gives a fresh copy. Saving and `onChange` are untouched.
- **Security.** The report is untrusted input to the language server only. It is validated and size-capped, and the diagnostic-filter regex escapes the names. No HTML rendering. No factory-ID leaks in code, comments, spec names or `data-testid` (grepped diff and untracked files).
- **System tests.** The helper reads the real `ScriptFlowVariables.kt` (override `FEATURE_BASE_DIR`) and SKIPs with a reason when it is absent. The black-box suites import no platform code. The image suite copies the source into the container, so the offline run keeps working.

### Findings

FR-1 [MINOR] workbench `release_notes/RELEASE_NOTES_v0.0.16.md:172` — the new bullet is appended after the closing `**Full diff:** …` line, separated from the other feature bullets. Move it into the feature list above that line.

FR-2 [MINOR] workbench `language-server-extension/src/browser/ContextDocuments.ts` (`openEntry` / `acknowledged`) — `UNCONFIRMED`: if `sendRequest` rejects synchronously (rather than returning a rejected promise) inside the `Promise` executor, the promise rejects, there is no `.catch` on `acknowledged(...).then(...)`, and the entry never settles, so the script's open is delayed until the wire changes. Scenario: a connection whose `sendRequest` throws while the wire is closing. Fix: add `.catch(() => entry.settle())` or make the executor swallow it.

FR-3 [MINOR] workbench `DocumentSynchronizer.ts` `open()` — `this.contextReady().then(...)` has no rejection handler. `ContextLease.ready()` is documented never to reject, so this is fine today, but a defensive `.catch` or `finally` would stop a future lease implementation from leaving `waiting` stuck.

FR-4 [NIT] workbench `KotlinScriptRegistration.ts:22` / `ClientMessageGuard` — `escapeRegExp` is a local helper; fine, but if a second language needs it, move it to `common`.

FR-5 [NIT] system-tests `suites/api/kotlin-lsp-bridge.mjs` (1417 lines) and `suites/ui/kotlin-lsp.mjs` (1375 lines) — well past the ~300-line signal, but each is a flat list of independent checks that share lib helpers, and this is the style of the existing suites. Splitting by scenario group would help the next change. No action needed now.

FR-6 [NIT] The plan's `contextKey` was replaced by the core-owned namespace (stated under SCOPE in `04-frontend-dev.md`). I agree with the reasoning (a URI can be owned by one connection only). Recorded for the reporter. Completion items carry no KDoc (server limitation); hover only.

NOT VERIFIED by me (needs a rebuilt workbench or live stack, which was out of scope): browser behaviour, bridge `context` group and the new UI scenarios, the image suite, and the existing checks now routed through `openContext`.

Counts: BLOCKER 0, MAJOR 0, MINOR 3, NIT 3.

### Verdict: APPROVED

## Knowledge updates

1. **Page: workbench (language intelligence section)** — The editor context flow: a node reports `options.scriptContext` on the `script` control → `CodeEditorRenderer` → `LanguageIntelligenceFooter` → `useLanguageIntelligence(editor, language, editorContext)` (keyed by JSON via `workflow-editor-extension/src/common/EditorContextKey.ts`) → `LanguageIntelligenceService.attach(model, languageId, registrationId?, rawContext?)` → `registration.parseContext` (`undefined` ⇒ no session, plain editor) → `ContextDocuments.acquire` → hidden context document(s) → `VirtualDocument` plan with `(context, namespace)`. Evidence: files listed.
2. **Same page, pitfall** — A script document must only be opened after its context document was acknowledged by an awaited request (`documentSymbol`), otherwise the server can lose the script's first analysis (`DocumentSynchronizer` `contextReady`, `ContextDocuments.acknowledged`; timeout default 5000 ms). Namespaces are `ctx<hash><6-char scope>[n<k>]`, and the package is `continuum.<namespace>`.
3. **Same page, convention** — `LanguageServerRegistration<C>` has optional `parseContext` / `contextDocuments`, and `diagnosticFilter` may be a function of the context. The Kotlin registration has an empty `seedFiles` and no member list of the script API. `GenericityGuard.spec.ts` fails if `FLOW_VARIABLE_MEMBERS`, `SCRIPT_BINDING_NAMES`, `CONTEXT_FILE_SOURCE`, `ContinuumContext` or `ScriptFlowVariables` reappear in non-spec workbench sources.
4. **Page: system tests** — `continuum-system-tests/lib/kotlin-script.mjs` builds the reported context from the real `continuum-feature-base/features/continuum-feature-analytics/.../ScriptFlowVariables.kt` (override `FEATURE_BASE_DIR`); suites SKIP the dependent checks when absent. Node tests for the node suites run with `node --test test/*.test.js` and need no k6. Note that `npm`/`yarn` are not on PATH here: use `~/.nvm/versions/node/v22.23.2/bin`.
5. **Page: backend/feature-base (cross-link)** — Wire contract of `options.scriptContext`: `{language:'kotlin', bindings:[{name,type}] (row, flow), declarations}`, built by `ScriptContextReport.fromClasspath()` from the shipped resource `script-context/ScriptFlowVariables.kt`; limits enforced client-side: ≤ 64 KiB, ≤ 32 bindings, type ≤ 300 chars, no package/import line in the declarations (`KotlinScriptContext.ts`).

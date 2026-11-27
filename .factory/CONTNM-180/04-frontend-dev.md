# Frontend dev report — CONTNM-180

## Round 1

### Tasks
| Task | Status | Notes |
|---|---|---|
| FE-1 generic browser LSP client | DONE (unit level) | connection, service, Monaco adapter (injected Monaco), status chip + hook, Theia module/wire. Not run in a browser or against the real bridge (see Verification). |
| FE-2 / FE-3 / FE-4 | not started | out of scope this round |

### Design decisions (matched to the backend bridge as it exists in `src/node`)
- **Wire:** one Theia channel message = one JSON-RPC message as a string (`writeString`/`readString`) — same as `LanguageServerBridge`.
- **No `initialize` from the client.** The bridge answers it and forces full-text sync, so the client sends `didOpen` / full-text `didChange` / `didClose` and requests directly.
- **Document lifetime follows the wire, not the server state.** The bridge records open documents per wire and replays them when the server restarts, so the client opens a document once per wire (and again after a reconnect, since the bridge forgets a closed wire's documents) and keeps sending edits whatever the server state. (An earlier draft reopened on every `ready`; the bridge refuses duplicate opens, so that would have kept stale text — fixed after reading the bridge.)
- **Providers** (completion, hover, signature help, definition) are registered per language but answer only for their own model; requests are skipped unless the server is `ready`; failures/cancellations answer nothing. Diagnostics: filter rules → `PositionMapper.toUserDiagnostics` → `setModelMarkers`; stale-version diagnostics ignored; markers cleared when the server leaves `ready`.
- Triggers `.` (completion) and `(` `,` (signature help) are generic defaults, overridable via `LanguageIntelligenceServiceOptions.adapter`.
- Definition results are kept only when they point into the edited document.
- Own reconnect loop with back-off (`ReconnectingTransportSource`) because Theia's `listen(..., reconnect=true)` cannot be cancelled and would leak a handler per attach.

### Files changed (all under `continuum-workbench/language-server-extension/`, nothing in `src/node`)
- New `src/browser/`: `LspTransport.ts`, `TransportMessageStreams.ts`, `LspConnection.ts`, `MonacoTypes.ts`, `LspMonacoConversion.ts`, `VirtualDocument.ts`, `DocumentSynchronizer.ts`, `DiagnosticMarkerSink.ts`, `MonacoLspAdapter.ts`, `LanguageSession.ts`, `LanguageIntelligenceService.ts`, `ReconnectingTransportSource.ts`, `TheiaChannelTransport.ts`, `TheiaTransportSource.ts`, `LanguageServerStatus.tsx`, `useLanguageServerState.ts`, `LanguageServerFrontendModule.ts`; test helpers `src/browser/testing/{FakeWire,FakeConnection,FakeMonaco}.ts` (excluded from the build output).
- `tsconfig.json` (`jsx: react`, exclude `testing/`), `package.json` (`theiaExtensions.frontend` added next to the backend entry; deps `react ^18`, `@types/react ^18` — both already locked, so `yarn.lock` needs no change).
- Docs: workspace `README.md` (browser client section), release notes v0.0.16 sentence, knowledge `workbench.md`/`graph.json`/`change-log.md`.

### Specs added (→ AC)
| Spec | Covers |
|---|---|
| `LspConnection.spec.ts` (real `vscode-jsonrpc` over a fake wire: state notifications, request round trip, cancel, reconnect keeps subscriptions, dispose) | AC-9 (status transitions) |
| `ReconnectingTransportSource.spec.ts` (back-off, cap, healthy reset, dispose) | AC-9 |
| `LspMonacoConversion.spec.ts` (positions, markers, completion, hover, signature help, definition) | AC-2 (mapping end-to-end), AC-4/7/8 shapes |
| `LanguageIntelligenceService.spec.ts` (no registration → no-op and no connection; hidden lines sent, user text untouched; full-text change versions; diagnostics filtered+shifted; markers cleared; wire loss reopen; two models independent, providers back to baseline, `didClose`, connection closed with last model; providers scoped to own model; failed request → nothing; planning failure tolerated) | AC-6 (mapping), AC-9, AC-11, AC-12, AC-18 |
| `GenericityGuard.spec.ts` (existing; now also scans `src/browser`) | AC-15 |

### Test selectors
| `data-testid` | Element | AC |
|---|---|---|
| `language-server-status` (`data-state` = starting / ready / unavailable, `role="status"`) | `LanguageServerStatus` chip; rendered by FE-2 in the code editor footer | AC-9 |

### How to see it
Nothing visible yet: no editor calls `LanguageIntelligenceService.attach`. FE-2 wires `useLanguageServerState` + `LanguageServerStatus` into the node dialog.

### Wiring contract for FE-2 / language registrations
- Bind each registration: `bind(LanguageServerRegistrations).toConstantValue(registration)` (module id exported from `LanguageServerFrontendModule.ts`).
- The editor extension must bind a `MonacoProvider` to `MonacoInstanceProvider` (`getMonaco()` returns the Monaco it already holds; cast to `MonacoApi` if structural typing complains) and inject `LanguageIntelligence` (a `LanguageIntelligenceService`).
- `attach(model, languageId, registrationId?)` → `LanguageSession | undefined`; call `session.dispose()` on unmount (also auto-detaches on `model.onWillDispose`).

### Verification
| Command | Result |
|---|---|
| `yarn workspace @continuum/language-server-extension test` (run in the workspace; includes backend developer's specs at that moment) | PASS, 135/135 |
| `tsc --noEmit -p tsconfig.json` in the workspace | PASS |
| Production emit of the workspace (`tsc --outDir /tmp`, removed) | PASS |
| Theia build / browser run / real-bridge run / `yarn install --frozen-lockfile` | NOT VERIFIED (not allowed to build the full workbench). `TheiaTransportSource`/`TheiaChannelTransport`/`LanguageServerFrontendModule` are only type-checked, not exercised; `vscode-jsonrpc/browser` under webpack is unverified (it resolves and runs under Node in the specs). |

### User actions required
None for `yarn.lock`. A workbench rebuild is needed before any browser test (and FE-2 is not in yet).

### SCOPE / questions
- `package.json` is shared with the backend developer: I only added the `frontend` entry and two dependencies.
- The server's completion trigger characters and capabilities are not read from the server (the bridge returns its cached `initialize` result only if a client asks); defaults are used. Say if per-registration trigger characters are wanted.
- Edge: if a reconnecting wire opens before the bridge has processed the old wire's close, the bridge refuses the duplicate `didOpen` for the same URI (document keys are per-model, so this only affects a document reopened on a new wire). Not handled; low likelihood.

## Round 2
### Tasks
| Task | Status | Notes |
|---|---|---|
| FE-2 Kotlin Script dialog wiring | DONE (unit/type-check only) | hook + footer chip + store + contribution; save path untouched |

### Files changed (workflow-editor-extension)
- New: `common/LanguageIntelligenceDecision.ts(+spec)`, `browser/store/LanguageIntelligenceStore.ts`, `browser/contribution/LanguageIntelligenceContribution.ts`, `browser/hooks/useLanguageIntelligence.ts`, `browser/components/node-dialog/LanguageIntelligenceFooter.tsx`.
- Edited: `MonacoEditorWrapper.tsx` (optional `onEditorChange` prop), `CodeEditorRenderer.tsx` (editor state + footer; gets the raw declared `options.language`, so editors without a declared language are unaffected), `WorkflowEditorExtentionModule.ts` (contribution + Monaco provider bindings), `package.json` (workspace dep `@continuum/language-server-extension: "*"`, no yarn.lock change).
- Docs: AGENTS.md, release notes v0.0.16, knowledge pages.

### Specs added/changed
- `LanguageIntelligenceDecision.spec.ts` → editors attach only if the declared language is served (3 tests).

### Test selectors
- `language-intelligence-footer` (container), `language-server-status` (chip, `data-state`).

### How to see it
Open a workflow, double-click a Kotlin Script node, look under the script editor. Rest / CreateTable / Claude dialogs show no footer.

### Verification
- language-server-extension `tsc -p` (emits gitignored `lib/`): PASS
- workflow-editor-extension `tsc --noEmit`: PASS
- workflow-editor-extension tests: PASS 189/189; language-server-extension tests (incl. genericity guard): PASS 166/166
- NOT VERIFIED: Theia build/webpack bundling, Inversify wiring at runtime, browser behaviour, real bridge.

### User actions required
Rebuild the workbench before browser tests (`yarn install` links nothing new; no lockfile change).

### Docs updated
AGENTS.md, RELEASE_NOTES_v0.0.16.md.

### SCOPE / questions
None. Knowledge graph pages not updated for the round-2 nodes yet (see final message).

## Round 5 — fix round 1
### Tasks
| Task | Status | Notes |
|---|---|---|
| FE-A options read from `props.uischema.options` | DONE | footer/LSP now see the declared language |
| FE-B clipped popups | DONE (DOM not run) | `fixedOverflowWidgets: true`; installed Monaco makes content widgets `position: fixed`; no transform/filter/contain found on the MUI dialog ancestors in the source |
| BE-B own editor language id | DONE | `continuum-kotlin-script`; no `|| 'kotlin'` fallback (undeclared = plaintext) |
| FR-1 channel open failure | DONE | per-attempt watchdog (10 s) in `ReconnectingTransportSource`, retry with back-off, late wire adopted once, throwing opener caught |
| FR-2 thin build | DONE (option b) | `onUnreachable` -> connection `unavailable` instead of `starting` forever |
| FR-3 missing closing brace | DONE | generic plan flag `showTrailingErrorsOnLastUserLine` (errors only), set by the Kotlin prelude |
| FR-4 header placement | DONE | leading `/* */`, KDoc and `@file:` lines handled |

### Files changed
- editor extension: `common/DialogEditorLanguage.ts(+spec)`, `CodeEditorRenderer.tsx`, `MonacoLanguageRegistration.ts` (new id with Kotlin tokenizer, no extensions).
- language-server-extension: `common/{LanguageServerRegistration,PositionMapper}.ts`, `browser/{VirtualDocument,MonacoLspAdapter,LanguageIntelligenceService,LspConnection,LspTransport,ReconnectingTransportSource,TheiaTransportSource}.ts`, `kotlin/{KotlinScriptRegistration,KotlinScriptPrelude}.ts`; specs extended (PositionMapper, service, connection, reconnecting source, prelude).
- Behaviour notes: `registration.id` stays `kotlin-script`; wire `languageId` stays `kotlin`; providers register under the editor id. CreateTable's `freemarker` is mapped to `freemarker2` (before, nothing was read, so it showed Kotlin colours). Rest/Claude: `freemarker2` / `markdown` as declared.

### Verification
- `tsc` language-server-extension and editor extension: PASS. Specs: editor extension 192/192, language-server-extension 189/189 (includes the genericity guard).
- NOT VERIFIED: real DOM/CSS of the popups (no Theia build, :3005 untouched), highlighting of the new language id in a browser, bridge with the new id end to end, thin build.

### User actions required
Rebuild the workbench before the next browser test.

### Knowledge updates
`.claude/knowledge/workbench.md` and `change-log.md` (dialog language id, `editorLanguageId`, `onUnreachable`, `uischema.options`).

## Round 6 — fix round 3
### What changed
- Text: the claim that a missing closing brace is flagged is gone from the release notes; the real limits (no syntax-error markers; top-level `object`/`enum class`/`interface`/`typealias`/`const val` may be flagged "cannot be local"; `.kts` only partly supported, `.kt` supported) are now in the release notes, the workbench README and the language-server README (own "Limits" section; file-editor section moved out from under Tests). `.kts` qualified in the release notes, README and AGENTS. The language-server README also names the editor language id, `editorLanguageId`, the trailing-error flag and the 10 s watchdog. Code comment on the flag no longer promises an "unclosed block" marker.
- `ReconnectingTransportSource`: `attempt()` returns early when disposed or a wire is current; accepting a wire cancels a pending retry.
- `PositionMapper`: the trailing-error clamp now applies only to lines of `plan.trailingLines`; hidden header lines never map onto user text.
- Wording: hook/decision parameter renamed `editorLanguage`, comments fixed.
- New dependency-free spec `kotlin/DialogLanguageId.spec.ts` ties the dialog language id's three spellings together.
### Specs
Reconnect (late wire cancels retry, no second open), PositionMapper (header vs tail), prelude (header error dropped, import-only script), dialog language id.
### Verification
`tsc` both workspaces PASS; editor extension specs 192/192; language-server specs 220/220. Not run: Theia build, browser.
### Knowledge updates
Graph/pages unchanged in structure (no new modules); change-log line added.

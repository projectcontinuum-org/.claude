# Kotlin language server spike (CONTNM-180)

Driver: `spike/run-spike.mjs` (raw LSP client on `vscode-jsonrpc`, virtual documents, timings and RSS). Results: `spike/results/*.json`.

## Decision

**fwcd/kotlin-language-server 1.3.13**, Kotlin wrapped as `.kt` (not `.kts`), JRE 21, `-Xmx512m`.

## Candidates

| | fwcd 1.3.13 | JetBrains kotlin-lsp 271.2085.0 |
|---|---|---|
| Licence | MIT | Alpha/EAP, proprietary parts, EULA machinery |
| Artifact | `server.zip`, 90 MB unpacked; sha256 `4fe7d71d087b307c7869036171bd9d8c6a4284cd7c25b89098b0a24eb2d9b6d2` (`https://github.com/fwcd/kotlin-language-server/releases/download/1.3.13/server.zip`) | `kotlin-server-271.2085.0.tar.gz`, 373 MB, 1.2 GB unpacked; sha256 `e398e799027f41749ea33faa57470307d13d40f910961858c7e30adbd778ae08` |
| Java | runs on a JRE 21 (59 MB jlink: `java.base,java.desktop,java.instrument,java.management,java.naming,java.scripting,java.sql,jdk.net,jdk.unsupported`; no `jdk.compiler` needed) | ships JBR 25 (`minRequiredJavaVersion` 25); a JRE 21 cannot run it |
| Project model | works on a bare directory | needs a Gradle/Maven/json workspace import; with a bare directory: no diagnostics, no completions; Maven import failed (no `mvn`, would need network). json workspace format not tried (NOT VERIFIED) |
| Verdict | chosen | rejected |

Compiler inside fwcd is Kotlin 2.1.0; the node runtime is 2.2.21 (small language-level gap, last fwcd release 2025-01).

## Measurements (fwcd, `-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m`)

- initialize ≈ 0.65 s; first diagnostics ≈ 1.2 s after spawn; completion 100–200 ms; hover ≈ 20 ms.
- RSS ≈ 0.8 GB (0.87 GB at the end of a run). `-Xmx1g` → 1.0–1.2 GB; `-Xmx384m` → 0.8 GB, works; `-Xmx256m` → internal error. Recommend `-Xmx512m` and a documented RSS cap of about 1 GB.

## Behaviour in `.kt` mode (all scenarios pass)

- `row["a"]?.toString() + flow.get("x")`: no false positive.
- `val x: Int = "a"` → TYPE_MISMATCH at the exact range; fixing the text clears it.
- Completion after `flow.` → `get`/`set`/`all`; after `row.` → Map members; stdlib resolves.
- Hover shows the signature and KDoc; signature help works.

## Virtual document design

A shared context file `ContinuumContext.kt` (`package continuum`, stub `ScriptFlowVariables` with `get(name: String): Any?`, `set(name: String, value: Any?)`, `all(): Map<String, Any>`) is on disk **before** the server starts. Each document is: the user's leading import lines, then a hidden 2-line header (`import continuum.ScriptFlowVariables`, `fun continuumScript<N>(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {`), then the rest of the user text, then a hidden `\n}\n`. Documents may be open only in memory. Unique function name per document.

`row` type: `NodeInputReader.read(): Map<String, Any>?` (platform-core `NodeInputReader.kt:64`); inside the per-row loop it is non-null, so `Map<String, Any>`.

Limitations: imports must be hoisted above the header; `return` is not valid inside the `run { }` wrapper.

## fwcd quirks the implementation must respect

- Context file must exist on disk before the server starts, or the first document gets no diagnostics.
- It publishes no empty diagnostics for a never-erroring document: "no publish" means clean, so it is not a readiness signal; use a request (completion) for readiness.
- A rootUri/workspace folder is required (`--no-root`: nothing works).
- Warnings in the hidden header (UNUSED_PARAMETER row/flow) land in hidden lines and are dropped by the position mapper. Candidate filter rule for user code: UNUSED_VARIABLE on the user's own variables (decide in implementation).
- `.kts` mode: with default settings nothing works; with `kotlin.scripts.enabled=true` it works but is experimental (one `MISSING_SCRIPT_STANDARD_TEMPLATE` false positive with imports).

## Client library

`monaco-languageclient` (8.x–11.0.3) depends on `@codingame/monaco-vscode-*`, a different Monaco build from Theia's `@theia/monaco-editor-core` (the node dialog gets that namespace injected). Decision: thin custom adapter over `vscode-jsonrpc` 8.2.0 with the injected monaco.

## File-editor route (for the `.kt`/`.kts` file editor)

Recommendation: the VS Code extension route. `fwcd.kotlin` 0.2.36 from Open VSX (MIT; sha256 `79be50d4de08f29e0fabe30e9ee094eb86ce5eeae28bdd02bcc6dc6593453a2d`; `https://open-vsx.org/api/fwcd/kotlin/0.2.36/file/fwcd.kotlin-0.2.36.vsix`); settings `kotlin.languageServer.path`, `kotlin.java.home`, `kotlin.java.opts`, `kotlin.scripts.enabled`; activates `onLanguage:kotlin`. Running it in Theia's plugin host is NOT VERIFIED (system tests). Either route needs a second JVM (about 0.8 GB more): the node-dialog server must not see workspace files while the file-editor server needs the user's roots. `.kts` files are only partially supported.

## Packaging inputs

Production image (`node:24-slim`) has no JDK: add the 59 MB jlink JRE 21 (or a JRE 21) plus the fwcd zip under e.g. `/opt/continuum/kotlin-ls`, verified against the sha256 above.

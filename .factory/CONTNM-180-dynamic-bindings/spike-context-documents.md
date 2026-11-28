# Spike: reported declarations as a hidden second document (real fwcd Kotlin server 1.3.13)

Drivers: `spike/run-context-spike.mjs` (scenarios A–D, raw output `spike/result-context-spike.json`, log `spike/run.log`) and
`spike/run-open-order-spike.mjs` (open-order race). Server: `continuum-workbench/.kotlin-ls`, JDK 21, **empty** private
workspace, every document opened with `didOpen` only (nothing on disk), URIs of not-yet-existing files in the workspace.
Declarations = the interface text with its KDoc (hand-prepared; package line removed). Context document =
`package continuum.<key>` + declarations; script = `import continuum.<key>.*` + `fun continuumScriptN(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {` … `}`.

| # | Question | Result |
|---|---|---|
| A | `flow.` completion offers `get`, `set`, `all` | PASS (18 items) |
| A | Hover on `flow.set` shows the KDoc | PASS ("Sets or updates flow variable [name] for downstream nodes…") |
| A | `val x: Int = flow.all()` is an error on the user line | PASS (`TYPE_MISMATCH: inferred type is Map<String, Any> but Int was expected`) |
| A | valid script has no diagnostic and no "unresolved reference ScriptFlowVariables" | PASS (no diagnostic at all) |
| A | KDoc on the completion **items** | NOT offered: the items carry no `documentation`, `completionItem/resolve` fails ("Internal error"). Same on the header-fold path (D), so it is a server limitation, not a property of the context documents. KDoc is available through hover. |
| A | diagnostics published on the context documents | none reached the client in this run (the bridge drops them anyway) |
| A2/T | context document opened **immediately** before the script | FAILS intermittently: with two back-to-back `didOpen`s the script got no diagnostics at all in 4 of 5 runs (even later `hover` did not help; a `didChange` of the script did). |
| T | context `didOpen`, then an **awaited request on the context document** (`textDocument/documentSymbol`), then the script `didOpen` | PASS 6/6, first diagnostics after ~35–60 ms. A pause of ≥50 ms between the two opens also worked (3/3). |
| B | script opened first, context second | Script keeps "Unresolved reference" and gets **no** re-analysis from the late context (no republish, completion empty). A `didChange` of the script afterwards fixes it (type mismatch appears, unresolved gone). |
| C | two contexts with the same simple class name (`Counter`) in different packages, each script importing its own | PASS: each script resolves only its own member (`inc()` vs `dec()`), no errors, no redeclaration on the context documents |
| D | header-fold (declarations in the script's own hidden header) | Works for completion, hover, mismatch and valid-script silence **only with a unique package per document**; without one, a second document in the same package gets `Redeclaration: ScriptFlowVariables`. It also repeats the declarations in every script document. |

## Decision

`PATH=second-document`

Required behaviour (the core must guarantee it):
1. A context document is opened before any script document that uses it, and **the open of the first dependent script
   waits until the server has answered one request about the context document** (`textDocument/documentSymbol` on its
   URI) — otherwise the script's analysis is lost intermittently. Opening the context after the script is not repaired
   by the server without a `didChange` of the script.
2. Context documents use the `continuum-script:/ctx<hash>.kt` URI scheme with `package continuum.ctx<hash>`; the script
   imports `continuum.ctx<hash>.*`. Different contexts are isolated even with identical simple names.
3. After a server restart, re-open every live context document first (same barrier), then re-open the scripts.
4. Completion items have no KDoc on this server (hover does); AC-4's "with KDoc" therefore reads: members offered, KDoc on hover.

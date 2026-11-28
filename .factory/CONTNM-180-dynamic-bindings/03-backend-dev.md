## Round 1
### Tasks
| Task | Status | Notes |
|---|---|---|
| BE-1 | DONE | `ScriptFlowVariables` is now an import-free interface; `ExecutionContextFlowVariables` implements it. The convention plugin leaves `processResources` extendable: `build/resources/main/script-context/ScriptFlowVariables.kt` is produced (no fallback needed). |
| BE-2 | DONE | `ScriptContextReport` builds the map; `KotlinScriptNodeModel` parses its UI schema JSON and sets `scriptContext` into the `script` control's `options`. `propertiesSchema` untouched. |
| BE-3 | DONE | Old contract test replaced; docs pages updated. feature-base has no release notes/changelog file (no `release_notes/` dir) — nothing to add there; README row updated. |

### Files changed
continuum-feature-base (`features/continuum-feature-analytics`):
- `build.gradle.kts` — `processResources` ships `ScriptFlowVariables.kt` as `script-context/ScriptFlowVariables.kt`.
- `.../node/ScriptFlowVariables.kt` — now `interface` (get/set/all + KDoc, no imports).
- `.../node/ExecutionContextFlowVariables.kt` — new runtime implementation (unchanged behaviour, `set(null)` refused).
- `.../node/ScriptContextReport.kt` — new: reads resource, strips `package` line, fails on `import` or missing resource, builds the map.
- `.../node/KotlinScriptNodeModel.kt` — uses `ExecutionContextFlowVariables`, adds `ROW_BINDING_TYPE`/`FLOW_BINDING_TYPE`, `withScriptContext`; removed the TS-prelude reminder KDoc.
- tests: deleted `KotlinScriptBindingsContractTest.kt`; new `ExecutionContextFlowVariablesTest`, `ScriptContextReportTest`, `KotlinScriptReportedContextTest`.
- `README.md` — Kotlin Script row mentions the reported bindings.

continuum-docs:
- `docs/contributing/create-new-nodes/design-the-settings-dialog.md` — new section "Giving a code field editor intelligence: `scriptContext`".
- `docs/feature-nodes/base-analytics.md` — "Editing a Kotlin script" paragraph (names come from the node; older worker ⇒ plain editor).

### Unit tests added/changed
- `ExecutionContextFlowVariablesTest` (5 tests: get inherited/unknown, own wins, set records, set(null) refused, all merges) → AC-2
- `ScriptContextReportTest` (5: shape, declarations content/no package/import, < 64 KB, import refused, only package stripped) → AC-1, AC-11
- `KotlinScriptReportedContextTest` (7: names equal constants; every reported name resolves when executed; unreported name fails; binding types stdlib/declared; declarations == shipped resource == repo source minus package; implementation implements interface; no public property) → AC-1, AC-3, AC-11
- `KotlinScriptNodeModelTest` (32, unchanged, green) → AC-2

### Verification
- `bash -ic 'sdk use java 21.0.11-tem && ./gradlew --offline :features:continuum-feature-analytics:processResources'` → PASS, resource present.
- `./gradlew --offline :features:continuum-feature-analytics:test` → PASS (BUILD SUCCESSFUL; suites above all 0 failures).
- Docs build (`npm run build` in continuum-docs): NOT VERIFIED (not run; links hand-checked).
- Redocly/OpenAPI: n/a (no platform-core change).

### API contract changes
No platform endpoint changes. The node metadata (`propertiesUISchema`) gains, on the `script` control:

```json
"options": {
  "format": "code", "language": "kotlin", "rows": 15,
  "scriptContext": {
    "language": "kotlin",
    "bindings": [
      {"name": "row",  "type": "Map<String, Any>"},
      {"name": "flow", "type": "ScriptFlowVariables"}
    ],
    "declarations": "<ScriptFlowVariables.kt source, package line removed, no imports, starts with the KDoc>"
  }
}
```
Binding order: row, flow. `declarations` is the interface file text with the `package` line removed (and leading blank lines trimmed); lines are `\n`-separated, 2-space indent, contains KDoc for the interface and its 3 members. Size well under 64 KB. `propertiesSchema` unchanged.

### Docs updated
continuum-docs pages above; feature-base README. No release notes in feature-base (none exist). AGENTS.md of feature-base is generic DOX, no change needed. The workbench-side upgrade note remains for FE-7.

### SCOPE / questions
None. Note: the `.claude/knowledge` graph was not updated by me (workbench-side facts still to come in FE tasks); backend fact for it: feature-base ships `script-context/ScriptFlowVariables.kt` as a resource and reports it through `ScriptContextReport`.

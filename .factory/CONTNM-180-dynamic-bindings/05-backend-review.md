# Backend review: CONTNM-180-dynamic-bindings

## Round 1

Scope: `continuum-feature-base` (`features/continuum-feature-analytics`), plus the two `continuum-docs` pages and the README row. No platform-core change, so there is no OpenAPI, tenancy or Temporal surface. I verified the diff and the untracked files, and I re-ran `./gradlew --offline :features:continuum-feature-analytics:test` (BUILD SUCCESSFUL).

### Checked
- **Plan vs. code**: the interface/implementation split, the resource wiring, `ScriptContextReport` and the `scriptContext` injection into the `script` control's `options` match the plan. `propertiesSchema` is untouched.
- **Behaviour preserved**: `ExecutionContextFlowVariables` has the same bodies as the old class, including the refusal of a null in `set`. `execute` binds the same `row` and `flow`. There is no remaining caller of the old constructor.
- **Drift protection**: the test compares the reported declarations to the shipped resource and to the repo source. The test also executes the script with each reported name and with an unreported one.
- **Fail-fast**: a missing resource or an `import` line throws and never produces an empty context.
- **Node model**: no `$` ports, and the `.doc.md` and `propertiesSchema` are unchanged.
- **Release notes**: feature-base has no `release_notes/` directory, so there is nothing to update. The README row is updated.
- **Docs**: the wire shape in the docs matches the code.
- **Factory IDs**: none in code, tests, docs or the README.

### Findings

**BR-1 [MINOR]** `KotlinScriptNodeModel.kt` (the `uiSchema` initializer) — the formatting `withScriptContext(uiSchema = objectMapper.readValue(""" … """.trimIndent(), …))` wraps a large text block inside a call, which hurts readability. Fix: extract the parsed base schema into a private val, then `val uiSchema = withScriptContext(uiSchema = baseUiSchema)`.

**BR-2 [MINOR]** `KotlinScriptNodeModel.kt` (`withScriptContext`) — the function mutates the map it receives and returns the same instance, and it relies on unchecked casts to `MutableMap`. This works today because Jackson returns `LinkedHashMap`. A change of mapper or schema shape would surface as a `ClassCastException` at node construction rather than a clear message. Fix: build the `options` map explicitly (copy-on-write) or add a `check` with a descriptive message.

**BR-3 [MINOR]** named arguments — a few Kotlin-declared calls are positional: `Regex(...)` in `KotlinScriptReportedContextTest`, `checkNotNull(ScriptFlowVariables::class.simpleName)`, `error("…")`, `check(importLine == null) { … }` and `getResourceAsStream`-adjacent helpers. Fix: use `Regex(pattern = …)`, `checkNotNull(value = …)` and `error(message = …)` where the stdlib permits it. Remaining positional uses are `mapOf` pairs and Java APIs, which are exempt.

**BR-4 [NIT]** `ScriptContextReport.stripPackageLine` — the `import` check matches any line that starts with `import `, including a KDoc continuation line that was reflowed to begin with that word. KDoc lines start with `*`, so this is theoretical. No action needed.

**BR-5 [NIT]** `KotlinScriptReportedContextTest` — the test reads `src/main/kotlin/...` relative to the working directory, which assumes Gradle runs tests from the module directory (the default). A comment would make that dependency explicit.

### Verdict
**APPROVED** (0 BLOCKER, 0 MAJOR, 3 MINOR, 2 NIT).

## Knowledge updates
- Page `workbench.md` or the feature-base page (whichever covers the Kotlin Script node): `continuum-feature-analytics` ships `ScriptFlowVariables.kt` as the classpath resource `script-context/ScriptFlowVariables.kt` through `tasks.processResources` in `features/continuum-feature-analytics/build.gradle.kts`. `ScriptContextReport` strips the package line and builds `options.scriptContext` of the `script` control. `KotlinScriptReportedContextTest` guards against drift. The convention plugin leaves `processResources` extendable. Evidence: `build.gradle.kts`, `ScriptContextReport.kt`.
- Pitfall: `ScriptFlowVariables.kt` must stay import-free because `ScriptContextReport` throws on an `import` line.

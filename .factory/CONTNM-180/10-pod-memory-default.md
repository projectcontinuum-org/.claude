# Raise the default workbench pod memory (continuum-cluster-manager)

## Context

The backend review (`07-backend-review.md`, the memory finding) and the system tester's memory section
(`05-backend-system-tests.md`) both measured a single Kotlin language-server process at about 0.7-0.9 GB resident,
with the whole workbench pod peaking at 0.82-0.94 GB — too close to the default 1Gi memory limit, especially with a
parallel `continuum-workbench` fix round adding server auto-restart on repeated OOM (which will restart inside the
same tight limit). This task raises only the **default** pod memory request/limit in `continuum-cluster-manager`
(512Mi/1Gi → 1Gi/2Gi). The allowed/max range validated by `WorkbenchInputValidator` is untouched, and no other
resource's default (CPU, storage) changed.

> **Superseded by the follow-ups below:** the final implementation uses 2Gi/4Gi for the default and Small preset.
> The earlier 1Gi/2Gi values in this historical section describe the first implementation only.

## What changed

| File | Change |
|---|---|
| `continuum-cluster-manager/src/main/kotlin/.../model/ResourceSpec.kt` | `memoryRequest` default `512Mi` → `1Gi`, `memoryLimit` default `1Gi` → `2Gi`; `@Schema` `defaultValue`/`example` updated to match (the `memoryLimit` example was already `2Gi`, illustrating a non-default value that now happens to equal the new default) |
| `continuum-cluster-manager/src/main/kotlin/.../entity/WorkbenchInstanceEntity.kt` | `memoryRequest`/`memoryLimit` constructor defaults updated the same way |
| `continuum-cluster-manager/src/main/resources/schema.sql` | `memory_request`/`memory_limit` column `DEFAULT` clauses updated |
| `continuum-cluster-manager/src/test/resources/schema-h2.sql` | same, for the H2 test schema |
| `continuum-cluster-manager/frontend/src/types/api.ts` | `DEFAULT_RESOURCES` constant updated (currently unused elsewhere in the frontend, but kept consistent) |
| `continuum-cluster-manager/frontend/src/components/CreateWorkbenchModal.tsx` | The modal's initial state and its post-create reset now pre-select `SIZE_PRESETS[1]` ("Medium", 1Gi/2Gi) instead of `SIZE_PRESETS[0]` ("Small", 512Mi/1Gi), so the dialog's default selection matches the backend's new default. The `SIZE_PRESETS` array itself (Small/Medium/Large/XL) and `MEMORY_OPTIONS` slider list are untouched per the task's instructions — they are preset choices, not "the default". |
| `docs/api/continuum-cluster-manager.openapi.yaml` | Regenerated via `generateOpenApiSpec` (not hand-edited): `WorkbenchResources.memoryRequest/memoryLimit` schema `default`/`example` now `1Gi`/`2Gi` |
| `docs/api/ENDPOINT_INVENTORY.md` | `POST /api/v1/workbench` body description: defaults text updated to `memoryRequest 1Gi, memoryLimit 2Gi`, with the reason (Kotlin language server memory need) added in plain words, no finding IDs |
| `release_notes/RELEASE_NOTES_v0.0.23.md` | Added a bullet under `### continuum-cluster-manager` describing the new default and the real reason (Script dialog's Kotlin language server needs about 0.7-0.9 GB resident), and a matching bullet under `## Upgrade notes` so operators notice the change; both use the ticket id `CONTNM-180` only, per the existing house style for release notes (customer-facing ticket ids are used elsewhere in this file for headings; internal review/finding ids are not used) |

### Unit tests updated (asserting the literal default value)

| Test | File | Change |
|---|---|---|
| `default values are correct` | `ResourceSpecTest.kt` | `512Mi`/`1Gi` → `1Gi`/`2Gi` |
| `entity has correct defaults for resource fields` | `WorkbenchInstanceEntityTest.kt` | same |
| `createWorkbench with default request values uses defaults` | `WorkbenchServiceTest.kt` | same |
| `updateWorkbench rejects hostile values and leaves existing resources untouched` | `WorkbenchServiceTest.kt` | The workbench under test is created with no explicit `resources`, so its stored/deployed `memoryLimit` is the create-time default. After three failed update attempts, the test asserts the deployment and the stored entity still have that default value — updated from `1Gi` to `2Gi` to match. |

### Tests read and deliberately left unchanged (with reasoning)

- `WorkbenchControllerTest.kt` (`POST returns 201 with full resource spec`, `GET instance returns response with all fields`): both build an explicit, fully-populated `ResourceSpec`/JSON body with `memoryRequest: "1Gi"`, `memoryLimit: "4Gi"` as arbitrary custom values to exercise the "full spec" path, not the create-time default. Left unchanged.
- `OverlayServiceTest.kt`: `baseDeploymentYaml` (`memory: "512Mi"` / `"1Gi"`) and `defaultModel` (`memoryRequest`/`memoryLimit` to `"512Mi"`/`"1Gi"`) are synthetic FreeMarker-overlay fixtures, not values that flow through `WorkbenchService`/`ResourceSpec` defaulting. They test overlay rendering/patching in isolation and never assert "the create-time default"; changing them would not improve coverage of the real default. Left unchanged.
- `WorkbenchInputValidationHttpTest.kt`: the `resources(...)` helper's hardcoded `"memoryRequest" to "512Mi"` and the various `"1Gi\n..."` hostile payloads are inputs built to make every test change exactly one field while exercising manifest-injection rejection; none asserts a system default. Left unchanged.
- `WorkbenchInputValidatorTest.kt`: `"1Gi"`/`"512Mi"` appear only in `@ValueSource` lists of arbitrary valid/hostile Kubernetes quantity strings for the generic `validateQuantity` parser test, unrelated to `ResourceSpec`'s default. Left unchanged.
- `WorkbenchServiceTest.kt` lines using `memoryRequest = "1Gi"` in `ResourceUpdate`/custom `ResourceSpec` construction (for example `updateWorkbench updates image and resources`, `listWorkbenches returns correct data in responses`, the manifest-injection regression tests using `"1Gi\n..."` hostile payloads): all are explicit custom values the test supplies, not assertions about the create-time default. Left unchanged.
- `continuum-cluster-manager/AGENTS.md`: searched for any documented default-memory numbers; found none (it documents the validator's rules and template model keys, not concrete default values), so no change was needed there.
- `WorkbenchUpdateRequest.kt` (`ResourceUpdate`): every field is nullable with no default (an update keeps the current value when a field is omitted); its `@Schema` `example`s (`1Gi`, `4Gi`, `20Gi`, ...) illustrate possible new values, not "the default", so left unchanged.
- `WorkbenchController.kt`'s `"GPU variant with more memory"` OpenAPI example (`memoryRequest: 512Mi, memoryLimit: 2Gi`) is an explicit non-default example value (paired with a GPU image/variant), not an illustration of the create-time default (the sibling `"defaults"` example correctly has no `resources` at all). Left unchanged.

## Verification

| Command | Result |
|---|---|
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:test --offline'` | **PASS** — `BUILD SUCCESSFUL`, 279 tests, 0 failed (includes `OpenApiSpecTest`'s spec-drift check, which initially failed until the spec was regenerated) |
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:generateOpenApiSpec --offline'` | **PASS** — regenerated `docs/api/continuum-cluster-manager.openapi.yaml`; diff limited to the `memoryRequest`/`memoryLimit` `default`/`example` values |
| `bash -ic 'npx --yes @redocly/cli@2 lint docs/api/continuum-cluster-manager.openapi.yaml --config redocly.yaml'` (from `continuum-platform-core`) | **PASS** — "Your API description is valid." |
| `npx tsc --noEmit` (frontend, using the Node toolchain under `continuum-cluster-manager/.gradle/nodejs/`) | **PASS** — exit 0, no errors |
| `./gradlew :continuum-cluster-manager:test` frontend step (`frontendBuild` → `tsc && vite build`) | **PASS** — ran as part of the Gradle test task above; `vite build` succeeded (407 modules transformed) |
| `npm run lint` (frontend eslint) | **NOT VERIFIED** — `eslint` is not installed under the available `node_modules` in this environment (`sh: 1: eslint: not found`); `tsc` (the typecheck half of the module's own `build` script) passed |

No other module needed rebuilding: this change does not touch `continuum-commons` or any other shared library, only `continuum-cluster-manager`'s own model/entity/resources/frontend/tests.

## API contract changes

`WorkbenchResources` schema (`POST /api/v1/workbench`, `GET`/`PUT /api/v1/workbench/{name}` response and request
bodies): `memoryRequest` default/example `512Mi` → `1Gi`, `memoryLimit` default/example `1Gi` → `2Gi`. No field added,
removed or renamed, no endpoint path or status code changed. The embedded management-UI frontend in this same repo
was updated to match (see above). Any other client that regenerates its OpenAPI client from
`docs/api/continuum-cluster-manager.openapi.yaml` only picks up new default/example values in the generated model
doc comments; no code-breaking change.

## Docs updated

- `docs/api/ENDPOINT_INVENTORY.md` — defaults text and the real reason for the change (Kotlin language-server memory
  need), no finding IDs.
- `release_notes/RELEASE_NOTES_v0.0.23.md` — new bullet under `### continuum-cluster-manager` and a matching one
  under `## Upgrade notes`, both stating the measured numbers and the reason in plain language; the `CONTNM-180`
  ticket id is used only because it is already this file's house style for headings (see the many existing
  `(CONTNM-180)` bullets for the loop-condition work in the same file), not an internal finding/task id.
- `continuum-cluster-manager/AGENTS.md` and the repo root `README.md` — checked for documented default-memory
  numbers; none found, so neither needed a change.

## SCOPE / questions

None. This round only raised the default pod memory request/limit as instructed; it does not touch
`continuum-workbench`'s own memory ceiling/ auto-restart logic (parallel fix round, out of scope here), nor the
`continuum-charts` Helm chart (which still sets no workbench-pod memory of its own — flagged in the release notes
so operators know a fresh install now gets the new cluster-manager default).

## Follow-up: Small preset floor

The user asked for the minimum pod memory (read as the Kubernetes memory *request*, matching what
`WorkbenchCard.tsx` labels "RAM") to be at least 2 GB in the management UI's Small size preset. Since Small is the
smallest choice a user can make and also the backend's own create-time default, this raises both the backend
default and the whole preset ladder above it.

### What changed (this round, on top of round 1 above)

| File | Change |
|---|---|
| `frontend/src/components/CreateWorkbenchModal.tsx` | `SIZE_PRESETS` memory values shifted up: Small `1Gi`/`2Gi` → `2Gi`/`4Gi`, Medium `2Gi`/`4Gi` → `4Gi`/`8Gi`, Large `4Gi`/`8Gi` → `8Gi`/`16Gi`, XL `8Gi`/`16Gi` → `16Gi`/`32Gi` (CPU, storage, labels and descriptions untouched). `MEMORY_OPTIONS` gained `'32Gi'` so Advanced mode's slider can still reach the new XL ceiling. The modal's initial `useState` and the post-create reset both pre-select `SIZE_PRESETS[0]` ("Small") again — this reverts round 1's temporary move to Medium, since Small itself now satisfies the 2Gi floor; the "Medium is pre-selected" comment from round 1 was removed. |
| `frontend/src/types/api.ts` | `DEFAULT_RESOURCES` `memoryRequest`/`memoryLimit` `1Gi`/`2Gi` → `2Gi`/`4Gi` |
| `ResourceSpec.kt` | `memoryRequest`/`memoryLimit` default params and matching `@Schema` `defaultValue`/`example` strings → `2Gi`/`4Gi` |
| `WorkbenchInstanceEntity.kt` | constructor defaults → `2Gi`/`4Gi` |
| `schema.sql`, `src/test/resources/schema-h2.sql` | `memory_request`/`memory_limit` column `DEFAULT` clauses → `2Gi`/`4Gi` |
| `WorkbenchController.kt` | the two OpenAPI examples that illustrate "more memory than default" (the `WORKBENCH_EXAMPLE` constant and the "GPU variant with more memory" `ExampleObject`, both previously `512Mi`/`2Gi`) bumped to `4Gi`/`8Gi` so they still read as "more than the default" against the new 2Gi/4Gi floor |
| `docs/api/ENDPOINT_INVENTORY.md` | defaults text rewritten to `2Gi`/`4Gi` with the updated reasoning (a Kotlin language server alone needs ~0.7-0.9 GB, up to ~2 GB once the file-editor extension's own server also runs) |
| `docs/api/continuum-cluster-manager.openapi.yaml` | regenerated via `generateOpenApiSpec` (not hand-edited); diff: `WorkbenchResources` schema `default`/`example` → `2Gi`/`4Gi`, the three example payloads' memory values updated to match the controller changes above |
| `release_notes/RELEASE_NOTES_v0.0.23.md` | **rewrote** (not appended to) the two bullets this round added under `### continuum-cluster-manager` and `## Upgrade notes`: both now state only the final numbers (2Gi/4Gi default and Small preset, Medium/Large/XL moved up to 4Gi/8Gi, 8Gi/16Gi, 16Gi/32Gi), the reason (Kotlin language server ~0.7-0.9 GB alone, up to ~2 GB with the file-editor extension's own server), that existing workbenches are unaffected until updated, and an explicit note that operators on small clusters must check node capacity before upgrading |

### Tests updated (re-judged against the new 2Gi/4Gi default)

| Test | File | Change |
|---|---|---|
| `default values are correct` | `ResourceSpecTest.kt` | `1Gi`/`2Gi` → `2Gi`/`4Gi` |
| `entity has correct defaults for resource fields` | `WorkbenchInstanceEntityTest.kt` | same |
| `createWorkbench with default request values uses defaults` | `WorkbenchServiceTest.kt` | same |
| `updateWorkbench rejects hostile values and leaves existing resources untouched` | `WorkbenchServiceTest.kt` | the preserved-default `memoryLimit` assertions (after three failed update attempts) updated `2Gi` → `4Gi` |

### Tests re-read and left unchanged (same reasoning as round 1, re-verified against the new numbers)

- `WorkbenchInstanceEntityTest.kt`'s `entity copy preserves all fields` (custom `memoryRequest = "2Gi"`), `WorkbenchControllerTest.kt`'s full-spec tests (`memoryRequest: "1Gi"`, `memoryLimit: "4Gi"`), `WorkbenchServiceTest.kt`'s explicit `ResourceSpec`/`ResourceUpdate` constructions throughout (update/list/manifest-injection tests), `OverlayServiceTest.kt`'s synthetic FreeMarker fixtures, `WorkbenchInputValidationHttpTest.kt`'s hostile-payload helper, and `WorkbenchInputValidatorTest.kt`'s `@ValueSource` quantity-parsing lists: all still supply arbitrary/fixture values unrelated to the create-time default (several still coincidentally use `1Gi`/`2Gi`/`4Gi`, but as explicit test input, not as "the default"). None needed a change this round either.
- `WorkbenchUpdateRequest.kt` (`ResourceUpdate`): still nullable fields with no defaults; its `@Schema` examples illustrate possible update values, not "the default". Left unchanged.

### Assumption the user can revert

**The whole preset ladder moved up, not just Small.** The user's instruction named only "the small tier preset", but
raising Small to 2Gi/4Gi while leaving Medium at its old 2Gi/4Gi would have collapsed two presets onto the same
values and broken the strictly-increasing ladder UX ("Medium" no longer meaning more than "Small"). I chose to shift
Medium/Large/XL up by the same factor (×2 of Small) so every tier still means strictly more than the one below it:
Medium 4Gi/8Gi, Large 8Gi/16Gi, XL 16Gi/32Gi. If the user actually wanted only Small to grow and the three larger
presets to stay where they were (accepting that Medium and the new Small would then tie), this is a one-file,
easily reverted change confined to `SIZE_PRESETS` in `CreateWorkbenchModal.tsx`; nothing else in this round depends
on Medium/Large/XL's specific values.

### Verification (follow-up round)

| Command | Result |
|---|---|
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:generateOpenApiSpec --offline'` | **PASS** — `BUILD SUCCESSFUL`; diff limited to the memory values listed above |
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:test --offline --rerun-tasks'` | **PASS** — `BUILD SUCCESSFUL`, 279 tests, 0 failed (forced re-execution, not a cached result, to be certain the new assertions were actually exercised) |
| `bash -ic 'npx --yes @redocly/cli@2 lint docs/api/continuum-cluster-manager.openapi.yaml --config redocly.yaml'` (from `continuum-platform-core`) | **PASS** — "Your API description is valid." |
| `npx tsc --noEmit` (frontend) | **PASS** — exit 0, no errors |
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:frontendBuild --offline --rerun-tasks'` | **PASS** — `tsc && vite build`, 407 modules transformed, no errors (forced re-execution) |
| `npm run lint` (frontend eslint) | **NOT VERIFIED** — still `eslint: not found` in this environment, same as round 1 |

### Docs updated (follow-up)

- `release_notes/RELEASE_NOTES_v0.0.23.md` — both bullets rewritten in place (not duplicated) with the final 2Gi/4Gi
  numbers, the full ladder shift, the reason, no impact on existing workbenches, and an explicit node-capacity
  warning for operators.
- `docs/api/ENDPOINT_INVENTORY.md` — defaults text and reasoning rewritten to the final numbers.
- `.claude/knowledge/workbench.md` — the pod-memory paragraph under the RSS measurements corrected from 1Gi/2Gi to
  2Gi/4Gi, with the two-server 1.7-2.05 GB headroom restated against the new 4Gi limit.
- `.claude/knowledge/change-log.md` — the round-1 entry is left as a historical record; a new follow-up entry
  explains it was superseded by the 2Gi/4Gi floor and the ladder shift, with the same verification summary.

### Summary for the orchestrator

Small preset and the backend default are now request 2Gi / limit 4Gi (meets the user's 2 GB minimum); Medium/Large/XL
moved up to 4Gi/8Gi, 8Gi/16Gi, 16Gi/32Gi to keep the ladder strictly increasing (explicit, revertible assumption,
see above); `MEMORY_OPTIONS` gained `32Gi`; OpenAPI spec regenerated and relinted; all touched unit tests pass
(279, forced re-run); frontend typecheck and build pass; `eslint` still not runnable in this environment (same gap
as round 1). Release notes and the knowledge graph now state only the final numbers.

## Follow-up 2: request above limit

The backend review (round 2) and the user flagged a regression the 2Gi/4Gi default raise caused: a caller that sends
a partial `resources` object touching only `memoryLimit` (for example `{"resources":{"memoryLimit":"1Gi"}}`) used to
work when the default request was 512Mi, but now merges to request 2Gi > limit 1Gi. Nothing compared request with
limit, so Kubernetes accepted the Pod spec at validation but rejected the owning Deployment, and the caller saw a
500 instead of a clear 400. Decision: reject request > limit with 400, naming both fields and values; equal request
and limit stays valid.

### What changed

| File | Change |
|---|---|
| `WorkbenchInputValidator.kt` | `validateResources` now calls a new private `validateRequestNotAboveLimit` for CPU and for memory, after the existing per-quantity syntax checks. It reuses the same Fabric8 `Quantity.parse`/`getAmountInBytes` already used for the syntax check (so `1Gi` vs `1024Mi` vs `500M` compare by amount, not by string), and throws the existing `IllegalArgumentException` with a message naming both fields and both values (for example `"memoryRequest '2Gi' must not exceed memoryLimit '1Gi'"`). |
| `ResourceSpec.kt` | One sentence added to the `@Schema` class description: a request must not exceed its own limit once defaults are applied. |
| `docs/api/ENDPOINT_INVENTORY.md` | `POST /api/v1/workbench` and `PUT /api/v1/workbench/{instanceName}` sections document the new rule, the reason (a Pod spec with request > limit is accepted by the validator but rejected by the Deployment, previously a 500), and that update checks the merged values before any Kubernetes or database write. |
| `docs/api/continuum-cluster-manager.openapi.yaml` | Regenerated via `generateOpenApiSpec` (not hand-edited): the `WorkbenchResources` schema description gained the new sentence. The regeneration also caught three example payloads that were still stale at `512Mi`/`2Gi` (left over from before the follow-up-1 round's edits to `WorkbenchController.kt`, which already had `4Gi`/`8Gi` in source — only the committed spec file hadn't been refreshed since); now `4Gi`/`8Gi` everywhere, matching the controller. |
| `release_notes/RELEASE_NOTES_v0.0.23.md` | Both memory bullets (the `### continuum-cluster-manager` one and the `## Upgrade notes` one) extended with a short paragraph: a `resources` object that sets a limit below its own (possibly default) request is now 400, not a later 500; existing workbenches keep their stored values (often still 512Mi/1Gi) until updated with `PUT /api/v1/workbench/{instanceName}` and a `resources` object (the management UI has no screen to edit an existing workbench's resources) or recreated. |

### Call sites covered

Read each call site rather than assuming: `WorkbenchInputValidator.validateResources` has exactly two callers in
`WorkbenchService.kt` — `validateCreateRequest` (create, on `request.resolvedResources()`, defaults already applied)
and `validateEntityTemplateValues` (on a `WorkbenchInstanceEntity`). The second one is called from three places:
`buildTemplateModel` (used by `createWorkbench` after save, `resumeWorkbench`, `updateWorkbench`'s own
`buildTemplateModel(updatedEntity)` call, and the rollback path's `buildTemplateModel(entity)` with the pre-update
entity), and directly by `updateWorkbench` on `updatedEntity` — the already-merged
`request.resources?.x ?: entity.x` values — before any K8s or database write, inside the same `try` block that logs
an audit failure and rethrows. So the new check applies to create, update (merged values, pre-write), resume and
rollback (the rollback path re-validates the pre-update entity, which was already valid when it was created/last
updated, so it is expected to keep passing there).

### Tests added

| Test | File | AC |
|---|---|---|
| `memory request below its limit is accepted` / `...equal to its limit is accepted` / `...above its limit is rejected` | `WorkbenchInputValidatorTest.kt` | basic ordering |
| `memory request above its limit is rejected across mixed units` (`1Gi` vs `1000Mi` rejected, `1Gi` vs `1024Mi` accepted, `500M` vs `1Gi` accepted) | `WorkbenchInputValidatorTest.kt` | unit-mixing comparison by amount, not string |
| `cpu request below its limit is accepted` / `...equal to its limit is accepted` / `...above its limit is rejected` | `WorkbenchInputValidatorTest.kt` | CPU side of the same rule |
| `createWorkbench rejects memoryLimit below the default memoryRequest` | `WorkbenchServiceTest.kt` | create with a partial `{memoryLimit: "1Gi"}` -> `IllegalArgumentException`, message names both fields, nothing created (reused `assertNothingCreatedFor`) |
| `updateWorkbench rejects a merged request above limit and leaves stored resources and deployment untouched` | `WorkbenchServiceTest.kt` | update that raises only `memoryRequest` past the stored default `memoryLimit` is rejected, and both the running Deployment's `resources` and the stored entity's columns are asserted unchanged |
| `POST with only a memoryLimit below the default memoryRequest returns 400` | `WorkbenchInputValidationHttpTest.kt` | HTTP-level 400 body naming both fields, next to the existing partial-resources case |

### Existing tests judged — two fixed (not weakened), rest unaffected

- **`updateWorkbench with only resources preserves existing image`** and **`updateWorkbench persists changes to
  database`** (`WorkbenchServiceTest.kt`) broke: both send `ResourceUpdate(cpuRequest = "4"/"8")` alone against a
  workbench created with no explicit resources, so the merged `cpuLimit` stayed the create-time default `"2"` and
  the new request exceeded it — a real gap the two tests happened to expose, not an intentional "above limit" test.
  Fixed by also setting a `cpuLimit` in the same `ResourceUpdate` (`"8"` and `"8"` respectively) so the scenario each
  test actually means to exercise (partial update changes only the named field, persistence) still holds; the
  asserted `cpuRequest` values are unchanged.
- Every other test that sends `"1Gi"`/`"2Gi"`/`"4Gi"`/`"500m"`/etc. together already keeps request ≤ limit (for
  example `ResourceSpec(cpuRequest = "250m", cpuLimit = "1", memoryRequest = "256Mi", memoryLimit = "2Gi", ...)`,
  the full-spec `WorkbenchControllerTest` bodies, the `OverlayServiceTest` FreeMarker fixtures, the
  `WorkbenchInputValidatorTest`/`WorkbenchInputValidationHttpTest` hostile-payload cases whose quantity is
  syntactically invalid and so already throws at the per-quantity check before the new comparison is reached) — none
  needed a change; confirmed by running the full suite once before any test fix (two failures, exactly the two
  above) and once after (zero failures).
- `WorkbenchUpdateRequest.kt`'s (`ResourceUpdate`) `@Schema` examples are illustrative values for individual fields,
  not full objects that get merged and compared together; left unchanged.

### Verification

| Command | Result |
|---|---|
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:compileKotlin --offline'` | **PASS** — confirms the new `Quantity`-based comparison compiles |
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:test --offline'` (before fixing the two tests) | **FAIL as expected** — 146 of the then-current subset run showed exactly `updateWorkbench persists changes to database` and `updateWorkbench with only resources preserves existing image` failing with `IllegalArgumentException`, confirming the new check is live and these two were the only regressions |
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:test --offline'` (after fixing the two tests, before spec regeneration) | **FAIL (expected, one test)** — only `OpenApiSpecTest > the public spec equals the committed docs-api spec` failed (the `@Schema` description sentence changed, spec not yet regenerated) |
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:generateOpenApiSpec --offline'` | **PASS** — regenerated the spec; diff limited to the three example payloads (stale `512Mi`/`2Gi` -> `4Gi`/`8Gi`, matching the controller source) and the `WorkbenchResources` schema description/default/example |
| `bash -ic 'sdk use java 21.0.11-tem && ./gradlew :continuum-cluster-manager:test --offline --rerun-tasks'` | **PASS** — `BUILD SUCCESSFUL`, 289 tests, 0 failed (forced re-execution, counted directly from the JUnit XML reports: `tests="289"`, `failures="0"`) |
| `bash -ic 'npx --yes @redocly/cli@2 lint docs/api/continuum-cluster-manager.openapi.yaml --config redocly.yaml'` (from `continuum-platform-core`) | **PASS** — "Your API description is valid." |
| `npx tsc --noEmit` (frontend) | not re-run this round — no frontend file was touched (the default/preset values and `MEMORY_OPTIONS` were already finished in the prior follow-up); last confirmed PASS still applies |

### API contract changes (this round)

`WorkbenchResources` schema description gained one sentence; no field added, removed, type-changed or renamed. A
caller that already always sends request ≤ limit sees no behavior change. A caller that was sending a partial
`resources` object whose merged request now exceeds its merged limit gets 400 instead of either succeeding (before
the memory-default raise) or 500 (after it, until this fix) — this is the regression fix the user asked for, not a
new breaking change relative to the pre-default-raise behavior.

### Docs updated (follow-up 2)

- `docs/api/ENDPOINT_INVENTORY.md` — create and update sections document the new 400 rule and the reason.
- `release_notes/RELEASE_NOTES_v0.0.23.md` — both existing memory bullets extended with the new rule and operator
  guidance (exact endpoint path `PUT /api/v1/workbench/{instanceName}` checked against `WorkbenchController.kt`
  before writing it).
- `.claude/knowledge/workbench.md` — one sentence added after the pod-memory paragraph describing the new
  request-vs-limit check, its call sites and that it predates any Kubernetes/database write.
- `.claude/knowledge/change-log.md` — new entry describing the regression, the fix, the two tests that had to be
  adjusted (and why that was not weakening the check), and the stale-example fix the spec regeneration also caught.

### SCOPE / questions

None. This closes the regression named in the backend review without reopening the Small-preset/default decision
from the prior round.

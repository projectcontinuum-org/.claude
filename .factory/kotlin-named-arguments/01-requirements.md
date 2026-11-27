# Kotlin Named Arguments
Status: READY FOR PLANNING

## User story
As a Kotlin developer, I want to use named arguments for every Kotlin call where the language permits them, so that call sites clearly communicate the meaning of each value. This is a binding rule, not a suggestion limited to multi-argument calls.

## Context — what exists today
- The shared factory convention asks for named arguments for constructors, data classes, and functions with 2+ arguments: `.claude/factory/CONVENTIONS.md:98`.
- The platform root guidance has the same scope: `continuum-platform-core/AGENTS.md:81`.
- Factory backend developer and expert guidance also calls for named arguments, but does not state the all-arguments, binding scope: `.claude/agents/factory-backend-developer.md:33,45`; `.claude/agents/factory-backend-expert.md:40,47`.
- Kotlin work is spread across `continuum-platform-core` and `continuum-feature-{base,ai,cheminformatics,knime,template}`. Root developer guidance exists in each except `continuum-feature-knime`, which has no root `AGENTS.md` (only nested guidance).
- No named-argument-specific automated check was found in the searched Gradle and CI guidance. Existing compliance is therefore not demonstrated to be machine-enforced.

## Feasibility

| Part | Verdict | Evidence | Notes |
|---|---|---|---|
| Establish a binding convention for Kotlin call sites | FEASIBLE WITH CHANGES | `.claude/factory/CONVENTIONS.md:98`; `continuum-platform-core/AGENTS.md:81`; backend role guidance cited above | The current convention is narrower. Widen it to every argument, including single-argument calls and tests, and align the developer instructions that apply across Kotlin repos. |
| Apply the rule where named arguments are unavailable | FEASIBLE WITH CHANGES | Kotlin language limitation; existing exception precedent in `.factory/loops/07-backend-review.md:236` for Java APIs | Kotlin cannot use named arguments at Java-declared call sites; some Kotlin call syntaxes (for example operator or function-value invocation) do not accept named arguments. State a narrow, unavoidable-syntax exception; do not require wrappers solely to make such calls nameable. |
| API, model, tenant/security, and compatibility impact | FEASIBLE | This is developer guidance only; no endpoint or model change is requested | No OpenAPI, generated client, Postgres, Avro, Parquet, or `@continuum/core` enum changes. No tenant isolation, credential, or input-validation impact. No runtime or ABI change. Using named arguments does couple Kotlin source callers to parameter names, so renaming a parameter can require caller updates; no binary compatibility change is expected. |
| Verification and enforcement | FEASIBLE WITH CHANGES | No named-argument-specific CI/lint check was located in the searched Gradle/CI sources | The requirement can be binding through developer guidance and review. Automated enforcement is not included; if desired later, it needs separate feasibility work for language/API exceptions and false positives. |
| Local verification limits | FEASIBLE | `.factory/environment.md` | JDK 21+ and an offline Gradle cache are available. Missing Node/Yarn are irrelevant to this documentation-only rule. No code build is required to validate the wording; machine enforcement cannot be verified because no such check was found. |

## Scope
**In**
- Make the rule unambiguous in the shared Kotlin developer convention and the applicable Kotlin developer/reviewer guidance: every argument at every Kotlin call site must be named when Kotlin syntax and the declaration permit it, including one-argument calls, constructors, data classes, and tests.
- Describe only unavoidable language or declaration limitations as exceptions. The rule remains mandatory everywhere else.
- Apply prospectively to Kotlin code written or modified under the rule; existing code cleanup is not implied.

**Out**
- Product behavior, API or data-model changes, and broad refactoring of existing call sites.
- A new formatter, linter, compiler plugin, or CI gate.
- Introducing wrappers solely to permit names where the original call form does not support named arguments.

**Assumptions**
- Java-declared APIs and Kotlin call forms that do not support named arguments are exempt only for those calls; use named arguments if an equivalent named-capable Kotlin call is available without an unnecessary wrapper.
- The binding requirement is enforced through developer guidance and code review for this request; automated enforcement is a separate decision.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Literal “never positional” is impossible for Java declarations and some Kotlin call syntax | Developers may be asked to write code the compiler rejects | Explicitly define the exception as compiler/language limitations only; make all supported call forms mandatory. |
| No automatic check means omissions can pass review | Rule may be applied inconsistently | Include the rule in contributor and reviewer guidance; reviewers treat supported positional Kotlin calls as violations. |
| Named calls bind source callers to parameter names | Renaming a parameter may require updating Kotlin callers | Treat parameter renames as source-level changes and update affected call sites in the same change. |
| Named arguments on every supported call can add visual noise | Readability may suffer in especially obvious calls | Keep the user-requested universal rule; do not silently narrow it to multi-argument calls. |

## Size
M — cross-repository developer guidance alignment, with no runtime code changes. Main risk is inconsistent application without automated detection.

## Draft acceptance outcomes
- **Given** a Kotlin developer adds or changes a call to a Kotlin function or constructor whose declaration and syntax support named arguments, **when** the call is reviewed, **then** every supplied argument—including a single argument and arguments in tests—is named; a supported positional argument is a rule violation.
- **Given** a call targets a Java declaration or uses a Kotlin call form that cannot accept named arguments, **when** the developer uses the required syntax, **then** the call is an explicitly permitted exception and the exception does not broaden to other positional calls.
- **Given** a developer or reviewer consults the applicable Kotlin guidance, **when** they look up the call-site rule, **then** it is stated as mandatory and is not limited to constructors, data classes, or functions with 2+ arguments.
- **Given** a change only updates this developer rule, **when** compatibility and runtime behavior are assessed, **then** there is no product/API behavior change and no claim that CI automatically checks compliance.

## Decisions
- The user requires a binding rule for Kotlin developers, not a suggestion limited to multi-argument calls.
- The rule applies to every argument wherever named arguments are supported; technical language/API limitations are the only assumed exceptions.
- No automated enforcement or codebase-wide cleanup is requested.

## Open questions
None.

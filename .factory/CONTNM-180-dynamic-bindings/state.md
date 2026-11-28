# CONTNM-180-dynamic-bindings — state
shell: bash (bash -ic, JDK 21 via SDKMAN: `sdk use java 21.0.11-tem`)
phase: DONE WITH OPEN ITEMS (see REPORT.md)
Follow-up of CONTNM-180 (Kotlin LSP). Same branches CONTNM-180 in continuum-workbench, continuum-feature-base, continuum-platform-core; all uncommitted work stays uncommitted.
Raw requirement (user): "instead of having a prelude copy of the Kotlin node's ScriptFlowVariables which binds the feature-base to core platform, these classes can be part of the node properties or propertySchema, and the workbench just uses it dynamically as the node reports."
Attachment: feature-base ScriptFlowVariables.kt (its KDoc says the workbench mirrors it in language-server-extension/src/kotlin/KotlinScriptPrelude.ts).
Related artifacts: ../CONTNM-180/ (requirements, plan, reports, REPORT.md).
Autopilot: orchestrator decides open questions; flags decisions in the final report.

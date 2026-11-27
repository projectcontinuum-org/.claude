## Round 1

### Environment
- Workbench: http://127.0.0.1:3003 (built from the working tree; build not user-confirmed, orchestrator-provided). Backend: api-server :8080, credentials :8083.
- Headless Chrome for Testing via Puppeteer (`.factory/tools/node_modules`), `--no-sandbox`, viewport 1700x1000.
- Workaround: the 3003 workbench has no `/api-server` / `/credentials-server` proxy (404), so the test browser forwards those paths to 8080/8083 with request interception. Theia "trust workspace" dialog is clicked; `.cwf` files open through Ctrl+P.
- Suite: `continuum-system-tests/suites/ui/loops.mjs` + `lib.mjs` (run: `WORKBENCH_URL=http://127.0.0.1:3003 SHOT_DIR=<dir> node suites/ui/loops.mjs`, ~5 min; `ONLY=run|looprun` for the run probes). 31 of 31 assertions in the suite pass; the failures below are things the suite could not drive or that are visual.
- Assertions read the autosaved `.cwf` (parentNode, position, width/height, data.collapsed, edges) plus the live DOM.

### AC coverage
| AC | Scenario | Result | Evidence (screenshots in `.factory/loops/screenshots/round-1/`) |
|---|---|---|---|
| AC-32 palette drop, membership, move, resize | Drop Loop from Node Explorer > Flow Control; drop node in/out; drag member out/in; move box; resize 4 handles; shrink stops at members | PASS (visual defects FE-A, FE-B) | 10, 11, 12, 13, 14, 15, 16, 17 |
| AC-30 edges never name the loop; cycle refusal | Connect across boundary; member -> outside -> member | PASS (refusal is silent, no toast) | 19, 20 |
| AC-33 collapse / expand | Collapse hides members, edges re-pointed to outline, stored edges JSON-identical, expand restores size, reopen stays collapsed | PASS | 21, 22, 23 |
| AC-34 condition dialog (CEL text, builder toggle, validation) | Double-click Loop | **FAIL** (FE-C): no Condition control at all, nothing to toggle or validate | 30-dialog-default, 30-dialog-probe, 31-dialog-wait |
| AC-35 Retry Policy hidden / condition validity / delete choice | Dialog shows only Properties tab (Retry Policy hidden: OK). Delete: choice Delete members / Keep members / Cancel | Delete choice PASS (Cancel keeps all; Keep members removes loop, members keep absolute position, no parent; Delete members removes members, outside nodes kept). Validation status / Replace: NOT VERIFIED (blocked by FE-C) | 40, 41, 42 |
| AC-36 CEL-only warning badge | Fixture with unrepresentable CEL (`exists(...) && size(...)`) | PASS: "CEL-only expression" shown on box. Opening it in the dialog: NOT VERIFIED (FE-C). Note: plain `false` also shows the badge | 50-badge, 64 |
| AC-37 run display (iteration k of max, status colours) | Run a workflow with a loop, Open Viewer | NOT VERIFIED: the run starts and the viewer shows the loop as "Skipped - No node inside the loop could run in iteration 1" (splitter members cannot run without input). No loop that executes iterations could be built from the UI. "Iteration k of max" text never seen; code renders `(N iter.)`. | 62, 63, 64 |
| AC-38 no regression | Loop-free workflow: open, connect, save, RUN ("Workflow started successfully") | PASS for editing and starting a run. Run viewer of a plain workflow with results not examined in depth | 60, 61 |

### Failures
- **FE-C (major, blocks AC-34/35)**: double-click on a Loop opens Node Settings with only Maximum iterations / When the limit is reached / When the condition is not true or false / Check the condition. Expected a Condition control (CEL editor, `loop-condition-mode-toggle`, validation status). Actual: none rendered, even after 8 s; none of the `loop-condition-*` test ids exist in the DOM. Probable cause (read from source, not proven): `QueryConditionRenderer.tsx` line 23 reads `options` from top-level props, but JSONForms passes `uischema.options`, so `options.format !== 'query'` is always true and it returns null (line 47). Screenshots 30-dialog-probe, 31-dialog-wait. -> frontend dev.
- **FE-A**: every Loop renders two stray React Flow handles (top target, bottom source). The global `.react-flow__handle` CSS stretches them into wide grey/blue ellipses across the header and body (visible in 10, 15, 21, 64). Plan says a Loop has no ports. The header ellipse may swallow clicks on the title; a click near the top edge of a box did not select it in one scenario. -> frontend dev.
- **FE-B**: edges that go into an expanded Loop are painted under the loop's 85%-white background, so they are nearly invisible inside the box; collapsed they are clear (19, 20 vs 21). Members look washed out in a light box. Cosmetic/medium. -> frontend dev.
- Observation (not a defect): viewer run status for the loop reads "Skipped" with the reason; iteration text unverified.

### Console & network errors observed
- Repeated `pageerror: view container is disposed` and one 404 favicon: baseline Theia noise, also on the plain home page. No loop-specific errors.
- `/api-server`, `/credentials-server` 404 on a bare `theia start` at 3003 (worked around, environment not product).

### Files changed
- `continuum-system-tests/suites/ui/lib.mjs`, `continuum-system-tests/suites/ui/loops.mjs` (new), `continuum-system-tests/README.md`, `continuum-system-tests/AGENTS.md` (DOX).
- `.factory/loops/06-frontend-browser-tests.md`, `.factory/loops/screenshots/round-1/*`. Stale draft `.factory/loops/scripts/test-loops-browser.js` left untouched (superseded).

## Round 2

Re-run after fix round 8 (FE-A/B/C). Screenshots: `.factory/loops/screenshots/round-2/`.

### Environment
- Workbench http://127.0.0.1:3003 (freshly restarted by the orchestrator, not touched). Backend 8080/8083 healthy. Headless Chrome for Testing via Puppeteer 25.19 (`.factory/tools`), viewport 1700x1000, same `/api-server` + `/credentials-server` forwarding as round 1 (the 3003 workbench has no proxy).
- Suites: `continuum-system-tests/suites/ui/loops.mjs` (regression, unchanged), new `suites/ui/loops-dialog.mjs` (`ONLY=visual|dialog|shapes|run`), `lib.mjs` (added `flags.failValidate`). DOX: README + AGENTS.md updated.
- AC-37 runs are real: a Create Table (outside the loop) feeds a Conditional Splitter (member, id `m1`). The loop condition reads the default flow variable `conditionalSplitterNode_m1.executionStatus`; the workflow was started with RUN and opened with "Open Viewer". `loopscenarios.js` does not exist in `continuum-system-tests/lib` (only mentioned in the backend report), so the fixtures are built in the suite.

### AC coverage
| AC | Scenario | Result | Evidence |
|---|---|---|---|
| FE-C (Condition control in dialog) | double-click Loop | **PASS**: CEL editor, `loop-condition-mode-toggle`, `-replace`, `-validation-status` render | 72, 73 |
| FE-A (no handles on Loop) | expanded and collapsed Loop | **PASS** (0 handles) — but see FE-H | 70, 71 |
| FE-B (edges/members visible in expanded Loop) | edge outside -> member | **PARTIAL**: member visible (PASS); the edge is still painted *under* the box body and fades to almost invisible inside it (first element at a point on the edge is the loop body) | 70, 19 |
| AC-34 CEL text editor, builder toggle | toggle builder<->CEL on `vars["hasMore"] == true` | PASS (text shown, toggle both ways) | 72, 73 |
| AC-34 simple condition opens in builder | `vars["hasMore"] == true`, `<= 10`, dotted name, or/not groups, and-of-or | PASS opens in builder. **FAIL on content**: the variable field always shows `------` (name never shown) | 72, 84 |
| AC-34 nested / quoted conditions | `vars['x'] != "a\"b"`, `(vars["n"] > -1.5)`, `(… \|\| …) && !(vars["c.d"] == "a\"b")` | **FAIL**: open in CEL mode, not the builder (plain nested and/or/not groups do open in the builder) | 78, 84 |
| AC-34 builder emits exact CEL | edit the builder value | **FAIL** (FE-F): the value input loses focus after one keystroke; the emitted CEL is a string literal (`== "f"`) not `false` | 77 |
| AC-34 validation | invalid text shows message + column; fixed text shows "Condition is valid."; Save not blocked | PASS | 75 |
| AC-35 unreachable validation | validate calls answered 503 | PASS ("Condition not checked…", never "valid") | 81 |
| AC-35 CEL-only condition: toggle disabled with reason; Replace asks confirmation | `exists(...) && size(...)` | **FAIL**: toggle looks enabled (clicks are silently ignored), no reason text; Replace changes the text immediately, no confirmation | 79, 80 |
| AC-35 Retry Policy hidden; delete choice | dialog tabs; delete Loop | PASS (only PROPERTIES tab; Delete members / Keep members / Cancel all correct) | 72, regression |
| AC-36 warning in the dialog | CEL-only condition | **FAIL**: no warning/reason in the dialog; only the canvas badge "CEL-only expression" (PASS) | 79, 50 |
| AC-37 run display, iterating loop | 3-iteration run (limit 3, stop-with-warning) and 1-iteration run, viewer | PASS for status: "Warning — Stopped at the limit of 3 iterations" (orange dashed box); "Success — Finished after 1 iterations" (green); members Success. The plan's "Iteration k of max" text is never shown (wording differs; "1 iterations" grammar). Running state was not observed (runs finish in ~1 s) | 90, 91 |
| AC-37 box in viewer | member inside expanded loop | **FAIL** (FE-G): loop box shrinks to ~174 px tall (stored 320 x zoom ≈ 440) so the member sticks out below the box | 90 |
| AC-37 collapsed loop stays collapsed in viewer | collapsed loop, run | PASS ("Finished after 1 iterations", member hidden) | 92 |
| AC-32, AC-30, AC-35 delete, AC-36 badge, AC-33 reload | `loops.mjs` regression | PASS (30 of 31 assertions) | 10–23, 40–42, 50 |
| AC-33 collapse: edges re-pointed | collapse a Loop with two boundary edges | **FAIL (regression)**: round 1 passed (edges re-pointed to the outline); now 2 edges -> 0 drawn, the stored edges are unchanged. Probably a consequence of removing the Loop handles (FE-A) | 21 |
| AC-38 plain workflow | edit/connect/save/run (round-1 probe, boundary-edge connect in suite) | PASS | 19 |

### Failures / findings
- **FE-H (major, regression from the FE-A fix)**: a collapsed Loop draws none of the edges that cross its boundary (they are valid in the file but invisible), so a collapsed Loop looks disconnected. Expected edges re-pointed to the outline as in round 1. Screenshot 21 (collapsed), 19 (same workflow expanded).
- **FE-D (major)**: typing in the CEL editor jumps to the builder as soon as the text momentarily parses as a builder-representable condition (typing `vars["a"] > 1` char by char: the editor is replaced by the builder after the first key, text lost). Source: `QueryConditionRenderer` effect re-picks the mode on every data change. Pasting a CEL-only text stays in CEL. Screenshot 82.
- **FE-E (major)**: clearing the CEL text removes the whole Condition control (no editor, no toggle, no status; Save disabled) and it cannot be recovered in the dialog. Source: `!data` returns null. Screenshot 83.
- **FE-F (major)**: builder value input loses focus after each keystroke, so a multi-character value cannot be typed; the edited value is emitted as a quoted string (`vars["hasMore"] == "f"`), not `false`. Screenshot 77.
- **FE-I (medium)**: builder never shows the variable name (select reads `------`), and the builder is unstyled native selects; nested shapes with escaped quotes / single-quoted keys / parenthesised negative float open in CEL (plan AC-34 lists them as builder shapes). Screenshots 72, 78, 84.
- **FE-J (medium)**: CEL-only condition: no disabled toggle/reason, no Replace confirmation, no warning in the dialog (plan AC-35/36). The Replace action is also destructive with no undo.
- **FE-G (major)**: viewer shrinks the expanded loop box so members overflow it. Screenshot 90.
- **FE-B (minor, still open)**: edge into an expanded Loop is under the box background and barely visible.
- **FE-K (minor)**: viewer text is "Finished after 1 iterations" / "Stopped at the limit of 3 iterations", not "Iteration k of max".
- Not a defect: Theia duplicate editor/viewer nodes with the same ids stay mounted (test reads the last).

### Console & network errors observed
- Baseline `pageerror: view container is disposed` (repeated), 404 favicon. One `400 POST /api-server/api/v1/workflow/validate` in the CEL-only badge fixture (validation of a workflow whose condition was edited). No loop-specific uncaught errors.

### Files changed
- `continuum-system-tests/suites/ui/loops-dialog.mjs` (new), `suites/ui/lib.mjs` (`flags.failValidate`), `README.md`, `AGENTS.md`.
- `.factory/loops/06-frontend-browser-tests.md`, `.factory/loops/screenshots/round-2/*`. `loops-dialog.mjs` reads a template workflow from `LOOP_TEMPLATE` (default `/tmp/dbg/looprun.cwf`), fragile; no product code touched. (Fixed in Round 3.)

## Round 3

### Environment
Workbench `http://127.0.0.1:3003` (rebuilt with fix rounds 9 and 10, not touched by me), api-server 8080 / credentials 8083 healthy. Headless Chromium via Puppeteer 25.19 (`.factory/tools`), 1700x1000. The test proxy in `lib.mjs` forwards `/api-server` and `/credentials-server`. **It buffers responses**, so the viewer's live stream does not advance after the first snapshot. Screenshots: `screenshots/round-3/`.
Suites run: `loops.mjs` (canvas regression), `loops-dialog.mjs` with `ONLY=visual|dialog|shapes|run|design|dragout|collapse` (new: `design`, `dragout`, `collapse`).
Harness change: the Loop descriptor is now fetched from the node explorer at run time (`/api/v1/node-explorer/search`); nothing is read from `/tmp` any more. `AGENTS.md` and the README are updated.

### Re-verification of the Round 2 findings
| Finding | Result | Evidence |
|---|---|---|
| FE-B edges/members stay visible in an expanded loop | **PASS** | `71-visual-expanded`, `100-design-expanded`. Wires are painted above the box and reach the member. |
| FE-D typing in the CEL editor no longer jumps to the builder | **PASS** | `82-dialog-typing`: typed `vars["a"] > 1` by hand, the editor and the text stay. |
| FE-E clearing the CEL text keeps the control | **PASS** | `83-dialog-cleared`: toggle and editor stay, `loop-condition-required` = "Condition is required.", Save is disabled, typing a new condition works. Note: the disabled-reason text is also shown while empty (see FE-N). |
| FE-F builder edits keep focus / literals | **PASS** | Boolean value checkbox toggled to false, CEL is exactly `vars["hasMore"] == false`, Save persists it (`77-dialog-builder-edit`). A text value could not be typed because the boolean field is a checkbox. The text-value path is covered by the shapes (`x != "a\"b"` is shown correctly). |
| FE-G viewer box keeps size and contains its member | **PARTIAL** | The member is inside the box (rect check passes), but the variable chips overlap the member and hide the status text (**FE-O**, `90-run-3-iterations`). |
| FE-H collapsed edges re-pointed to the box edges | **PARTIAL** | Both edges are drawn, the inbound one ends on the left edge. The outbound one starts at the LEFT edge and runs across the box (**FE-L2**, `100-design-collapsed`). |
| FE-I builder shows variable name and all shapes | **PARTIAL** | 9 of 10 shapes open in the builder with names such as `hasMore`, `c.d`, `x`. Still CEL: `!(single rule)` (`not-single-rule`). This may be grammar-intended (negation only on groups), so low. `!(a && b)` opens in the builder. |
| FE-J CEL-only: disabled toggle with reason, warning, Replace with confirmation | **PASS** | `79-dialog-cel-only`, `80-dialog-replace-clicked`, `80b-dialog-replaced`. Reason: "This condition uses CEL features the builder cannot show". Cancel keeps the text, Confirm replaces it with the default builder rule. |
| FE-K "Iteration k of max", singular wording | **PASS** | Caught `Iteration 5 of 40` (`90b-run-40-iterations-running`, polled every 0.4 s, opened the viewer the moment the notification appeared). Singular: "Finished after 1 iteration" (`91-run-1-iteration`). |

### AC coverage (Round 3)
| AC | Scenario | Result | Evidence |
|---|---|---|---|
| AC-34 | Condition control in the dialog: CEL editor, mode toggle, validation status | PASS | `72-dialog-simple` |
| AC-34 | Simple condition opens in the builder, builder to CEL to builder, values are emitted exactly, Save persists | PASS | `72`, `73`, `77` |
| AC-34 | Nested and/or/not shapes open in the builder (dotted names, groups) | PARTIAL (9/10 shapes; `!(single rule)` stays CEL) | `84-shape-nested` |
| AC-35 | Validation: valid, invalid CEL with message and column, fixed, unreachable gives "not checked", Save is not blocked | PASS | `75`, `81` |
| AC-35 | CEL-only: disabled toggle plus reason, Replace asks first, Cancel/Confirm | PASS | `79`, `80`, `80b` |
| AC-35 | Open the dialog by double-clicking the loop body | **FAIL** (no dialog opens; the gear `loop-settings-button` works) | none |
| AC-36 | Warning in the dialog for a CEL-only condition | PASS | `79-dialog-cel-only` |
| AC-36 | "CEL-only expression" warning on the canvas Loop node (`loops.mjs`) | **FAIL**: the redesigned header has no such badge (`50-badge`) | `50-badge` |
| AC-37 | Real iterating run, 3 iterations: Warning, "Stopped at the limit of 3 iterations", box contains the member | PASS (but see FE-O) | `90-run-3-iterations` |
| AC-37 | Running state "Iteration k of 40" | PASS (`Iteration 5 of 40` caught; the proxy buffers the stream, so I could not follow it to the end) | `90b-run-40-iterations-running` |
| AC-37 | 1 iteration is Success with the singular wording; a collapsed loop stays collapsed in the viewer | PASS | `91`, `92` |
| AC-32 | Palette drop, membership, relative positions, z-order, shrink stops at members, move with members | PASS | `loops.mjs` |
| AC-32 | Dragging a member out of the box un-parents it | **FAIL** (new regression FE-L, see below) | `110-dragout-*`, `13-member-dragged-out` |
| AC-32 | Resizing the box saves the new size | FAIL in `loops.mjs`, a consequence of FE-L (the box had already grown) | `16-loop-resized` |
| AC-33 | Collapse and expand with the header chevron, saved to the .cwf | PASS | `111-collapse-toggle-collapsed` |
| AC-33 | Collapsed edges re-pointed | PARTIAL (FE-L2) | `100-design-collapsed` |
| AC-30/38 | Edges across the boundary, cycle refused, no edge names the loop | PASS | `19`, `20` |
| FE-A | No handles on an expanded loop; the collapsed one has display-only anchors | PASS | DOM check |

Regression numbers: `loops.mjs` 28 PASS / 4 FAIL (FE-L cascade x3 plus the canvas CEL badge). `loops-dialog.mjs`: dialog 27/28 (the double-click only), shapes 9/10, run 8/8 on the loop checks, collapse 2/2, dragout 1/4.

### Failures and findings
- **FE-L (HIGH, regression)**: dragging a member towards or past the box edge makes the box grow instead of un-parenting the member. Right: the box becomes 740x320 (was 520x320). Below: 520x540. Left: the member stays a child (`parentNode=L`) and the box grows 520x415. Only dragging above works. Expected: the node leaves the loop and the box keeps its size. Likely cause: the "grow to contain members" logic from round 10 also runs in the editor. Screenshots: `110-dragout-right`, `110-dragout-left`, `110-dragout-below`, `13-member-dragged-out`. This breaks AC-32 "drag out of the loop".
- **FE-L2 (MEDIUM)**: collapsed loop, the outbound edge (m3 to after) starts at the box's left edge (x about 352) and runs across the box instead of leaving at the right edge (about 1065). Screenshot `100-design-collapsed`.
- **FE-O (MEDIUM-HIGH)**: run viewer, expanded loop after a run. The variable chips ("set by: Conditional Splitter (inside)" plus 5 chips of about 24px each) are rendered in a large font over the member node, and the status line "Stopped at the limit of 3 iterations" is cut off ("Stopped at the…") behind the member. The chips are truncated ("conditionalSplitterNode_m…"), which makes them useless. Screenshot `90-run-3-iterations`.
- **FE-M (MEDIUM)**: double-clicking the loop body (80% / 85% of the box) no longer opens the settings dialog. The gear works. The dev notes and earlier rounds say double-click opens it. Decide whether double-click is still required.
- **FE-P (LOW-MEDIUM)**: the canvas node no longer shows the "CEL-only expression" badge for conditions the builder cannot show (`loops.mjs` AC-36). The dialog has the warning. Decide whether the plan wording needs the canvas badge.
- **FE-N (LOW)**: for an empty condition the disabled-toggle reason is shown as well as the required message. The builder could be offered for an empty condition.
- **FE-Q (LOW)**: the viewer stays on "Iteration 5 of 40", Scheduled and the Cancel/Terminate buttons although the backend reports FINISHED. This is most likely my proxy buffering the stream (not a product bug), but I could not confirm it without a direct connection. Worth a manual check on the real proxy.
- **BE/FE note (LOW)**: `POST /workflow/validate` answers 400 "Failed to read request" when a node lacks `selected`, `dragging` or `positionAbsolute`. The editor sent such a Loop node when it came from a file without those fields. The dialog then shows "not checked". Worth hardening in the request builder or the backend (default them).

### Design check (3 mockups: 1 Collapsed, 2 Extended, 3 Nested)
Screenshots: `100-design-collapsed`, `100-design-expanded`, `100-design-nested`, `90-run-3-iterations`.
| Element | Mockup | Live | Deviation / severity |
|---|---|---|---|
| Dashed purple border, rounded | yes | yes (rgb 206,147,216, dashed) | match |
| Header: icon, LOOP label, title, condition chip, "max N", gear | yes | all present, plus a collapse chevron | chevron not in the mockup, LOW |
| LOOP label | monospace purple | purple, proportional font | LOW |
| Condition chip "while hasMore == true" | bordered monospace pill | dark filled rectangle, proportional font, no border | LOW |
| Collapsed body: "3 nodes inside" + "▸ expand" button | bordered button | present, "▸ EXPAND" is small, uppercase, blue, no border | LOW |
| Collapsed height | taller body | about 65px | LOW |
| Wires meeting the box edge, dashed bright purple | yes | thin (2px) solid, low contrast dark purple | MEDIUM (readability) |
| Collapsed wires on the left and right edges | yes | inbound OK, outbound leaves from the left edge (FE-L2) | MEDIUM |
| Expanded: wires cross the border straight into members | yes | yes | match |
| Expanded: "set by" line and variable chips after a run | one line of small chips under the header | chips are large, overlap the member, truncated, status hidden (FE-O) | HIGH |
| Nested: inner loop tinted differently | visible difference | fill rgba 0.14 outer, 0.184 inner, hardly noticeable | LOW-MEDIUM |
| Nested: wire crosses both borders | yes | yes (`100-design-nested`) | match |
| Fill | near-black | translucent purple on the light/dark workbench theme | LOW (theme driven) |
Overall: the structure matches; the main gaps are FE-O (viewer) and the edge contrast.

### Console and network errors observed
Baseline: `pageerror: view container is disposed` (repeated), favicon 404. The 400 on `/workflow/validate` described above for fixtures lacking `selected`, `dragging` or `positionAbsolute`.

### Files changed
- `continuum-system-tests/suites/ui/loops-dialog.mjs`: Loop descriptor from the node explorer, no `/tmp`; new scenarios `design`, `dragout`, `collapse`; dialog scenario rewritten for the new selectors; run scenario polls for "Iteration k of max".
- `continuum-system-tests/suites/ui/lib.mjs`: `NETLOG` / `NETFULL` response logging.
- `continuum-system-tests/suites/ui/loops.mjs`: the collapse toggle is clicked via DOM (the grown box can sit under the side panel).
- `continuum-system-tests/README.md`, `continuum-system-tests/AGENTS.md`: updated.
- `.factory/loops/06-frontend-browser-tests.md`, `.factory/loops/screenshots/round-3/*`. No product code touched.

## Round 4

### Environment
Workbench http://127.0.0.1:3003 (fix round 11), Puppeteer 25.19 headless, stack healthy. For the long-run check I started a streaming reverse proxy (`suites/ui/proxy.mjs`, :3013; forwards `/api-server`, `/credentials-server` and the `/mqtt` WebSocket to mosquitto :31884) and stopped it afterwards. Screenshots: `screenshots/round-4/`.

### Re-verification of findings
| Finding | Result | Evidence |
|---|---|---|
| FE-L drag member out right / below / above | PASS (parentNode cleared, box stays 520x320) | `110-dragout-*` |
| FE-L drag out to the left | PASS when dropped on empty space. If dropped over another node the member snaps back inside the loop (parentNode kept). Low | `110-dragout-left` |
| FE-L resize / no box growth | PASS | loops.mjs |
| FE-O viewer chips | PARTIAL (medium): single-line strip, but chips are truncated (3 of 7 visible), "set by" and the status line are clipped, and "Stopped at the limit of 3 iterations" touches the member top border | `90-run-3-iterations` |
| FE-L2 collapsed outbound edge leaves from right edge | PASS (x=1061.7 vs box right 1065; inbound x=351.9 vs box left 350) | `100-design-collapsed` |
| FE-M double-click opens settings | FAIL (medium): a real mouse double-click at 5 spots does not open the dialog. A synthetic `dblclick` event does, and the gear works | `130-dblclick-dialog` |
| FE-P `loop-cel-only-badge` | PASS (shown for CEL-only, absent for builder-representable) | `121-cel-only-badge` |
| FE-N empty condition | PARTIAL (low): the disabled-reason is gone and `loop-condition-required` shows, but the mode toggle is still disabled | dialog scenario |
| FE-I `!(single rule)` | PASS: all 10 shapes open in the builder (`c.d not equals ab`) | shapes scenario |
| validate payload (no selected/dragging/positionAbsolute) | PASS: "Condition is valid.", no 4xx | `120-payload-no-selected` |
| Collapse text action `loop-collapse-toggle` | PASS (collapse and expand, saved to the .cwf) | collapse scenario |
| FE-A handles, FE-B edges on top, FE-H | PASS | `ONLY=visual` |
| Viewer stuck on a long run (FE-Q) | NOT a product bug. The viewer gets live updates over MQTT WebSocket `ws://<host>/mqtt`, and the :3003 workbench serves no `/mqtt` route. Through my proxy with /mqtt forwarded, the 40-iteration run shows "Iteration 9/14/18… of 40" and reaches Warning + "Stopped at the limit of 40 iterations" | `ONLY=run` with PASSTHROUGH |

### AC coverage (regression)
- loops.mjs: 32 PASS, 0 FAIL.
- loops-dialog.mjs: visual PASS, shapes PASS, collapse PASS, payload PASS, design PASS (FE-L2). dialog: all AC-34/35/36 PASS except FE-N (toggle) and FE-M (real double-click). run: AC-37 PASS (3-iteration Warning, 1-iteration "Finished after 1 iteration", collapsed run stays collapsed, "Iteration k of 40" caught live, final status through the proxy). The only run FAILs are FE-O (chip rows/overlap) and the "Iteration k of 3" poll (a 3-iteration run finishes too fast; the 40-iteration poll passes).

### Design check vs the 3 mockups (remaining deviations)
Collapsed (`100-design-collapsed`): dashed purple border, icon, LOOP label, title, `while …` pill, "· max N", "3 nodes inside", "▸ EXPAND" and a gear all present; wires are dashed and meet the left and right edges. Expanded (`100-design-expanded`): wires cross the border, dashed. Nested (`100-design-nested`): the inner loop has a visibly lighter, more saturated tint, and wires cross both borders.

| Deviation | Severity |
|---|---|
| Fill is a strong, nearly opaque purple (about rgb 106,68,128) rather than the mockup's dark box with a subtle tint. The member nodes stand out less | low-medium |
| The condition pill has no clear border and its width is fixed, so the text is cut off with an ellipsis | low |
| LOOP label is not bold monospace like the mockup; the text is small | low |
| The "▸ EXPAND" and "COLLAPSE" controls are small uppercase blue text, not the mockup's bordered button. The expanded state has a collapse action the mockup doesn't show | low |
| The wire is faint inside the box near the member handle | low |
| Viewer variable chips are truncated and clipped (FE-O) | medium |

### Failures
- FE-M (medium): real double-click on the loop does not open the settings dialog; the gear works. Probably the first click selects and re-renders the node.
- FE-O (medium): viewer chips and status line are clipped or overlap the member.
- FE-N (low): empty condition leaves the builder toggle disabled; the dev note says it should stay available.
- FE-L (low): a left drop over another node bounces the member back.

### Console & network errors observed
Baseline: `pageerror: view container is disposed`, favicon 404. No 4xx on `/workflow/validate`.

### Files changed
- `continuum-system-tests/suites/ui/proxy.mjs` (new, streaming proxy incl. /mqtt WS), `lib.mjs` (`PASSTHROUGH`), `loops-dialog.mjs` (scenarios `payload`, `dbl`, `dragout`, `collapse`, run checks), `README.md` and `AGENTS.md` (DOX).
- `.factory/loops/screenshots/round-4/*`. No product code touched.

## Round 5

### Environment
Workbench :3003 (developer rounds 12+13). Puppeteer 25.19 headless, REAL mouse input (`page.mouse`). The workbench was restarted and rebuilt during the round: the 23:57 rebuild contains a fix for the drag-out offset (see FE-R). The streaming proxy (`suites/ui/proxy.mjs`, :3013, `/mqtt` forwarded) was used for the run viewer and has been stopped. Theia colour theme: `workbench.colorTheme` is `continuum-dark` (confirmed in `~/.continuum/settings.json`; the theme check changed it and I restored it). The profile has `files.autoSave: "off"`. Screenshots: `screenshots/round-5/`.

### Correction to round 4 (FE-M)
The round-4 "real double-click does not open settings" was a **test artifact**: Puppeteer's `click({count: 2, delay})` never sends the second mouse-up, so the browser never produced a click with detail 2. Without `delay`, a real double-click works. The `dbl` and `mouse` scenarios now use `count: 2` without a delay.

### Findings
| # | Result | Evidence |
|---|---|---|
| (1) Double-click, REAL mouse | PASS: opens "Node Settings" for ordinary nodes (seed, member) and for the Loop header-empty, body-bottom-right and body-middle-left. Gear still works. Single click selects. | `150-dblclick-node-*`, `151-dblclick-loop-*` |
| (1) Node drag | PASS for a node dragged fresh. **FAIL: FE-S** (below) after a click | `152` |
| (2) Selected Loop over edges | PASS: unselected, selected, hover, mid-drag, mid-resize and nested (both selected in turn). The Loop wrapper z-index is -1, below the edge layer, and the sample counts are the same as unselected. The screenshots show the dashed wire clearly over the box. | `160-edge-*`, `161-nested-selected` |
| (3) Resize grab areas | PASS: resize cursors 12px inside the 3 corners and 4px inside right, bottom, left and top edges. A real drag from the corner grows the box (615x379 → 706x450). A real drag of the right edge shrinks it. The gear and collapse button still receive the pointer. Visible handles are 7px. | `162-resize-corner` |
| (4) Styling | PASS (partly): the fill is a translucent tint (rgba(171,71,188,0.18); the nested inner loop is lighter, 0.23 and light purple). The pill has a 1px border, mono 13px, and fits at normal zoom. The collapse/expand button is a bordered outlined button. **Still not like the mockup**: see the design table. | `170-style-*` |
| (5) Viewer chips | PASS (visually): one horizontal scrollable row (scrollWidth 2551), the status line is below the chips and does not touch the member. The automatic "compact" check reports FAIL (a measuring heuristic, since the "set by" line is counted); screenshot is the evidence. "Iteration k of 3" is too fast to catch; "Iteration 9/14/18 of 40" is caught live; the 40-iteration run reaches Warning "Stopped at the limit of 40 iterations" through the streaming proxy. | `90-run-3-iterations` |
| (6) FE-N empty condition | PASS: no disabled reason, `loop-condition-required` shown, toggle enabled | dialog scenario |
| (7) Left drag-out over another node | The member now lands where it was dropped, but it **stays parented** (`parentNode=L`) when the drop point is over a top-level node (the seed) outside the box. Medium. See FE-T | `110-dragout-leftover` |
| (8) Builder theme | PASS: dark and light (Light (Theia)) both follow the theme: dark group rgb(37,37,38), rule rgb(54,60,80), purple buttons; light group rgb(243,243,243), rule white, blue buttons. Low note: in dark the validation box is near-black against the navy dialog. | `180-builder-dark`, `181-builder-light` |

### New findings
- **FE-R (high) — member dropped out of a Loop lands offset by the Loop's origin.** In the build tested at the start of the round, an un-parented member landed at the drop point minus the former parent's origin (a constant (-454, -146) screen px at this zoom; saved position about (647, 96) instead of about (908, 220)) in every direction, usually over the Loop header. parentNode was cleared and the box stayed 520x320. Screenshots `110-dragout-right.png`, `152-dragout-trace.png` (the node follows the cursor while dragging, then jumps on drop). **The rebuild at 23:57 fixes this**: right, below, left, above and over-node drops all land within 4px of the drop point.
- **FE-S (high) — after clicking an ordinary node in a workflow that contains a Loop, dragging it does not move it.** In the loops workflow, `click(seed)` then drag: the node does not follow the mouse and ends at the same place. Without the click it drags normally, and in a workflow without a Loop click-then-drag works. This passed earlier in this round (before the 23:57 rebuild) and now fails deterministically (3 runs), so it looks like a regression from the latest rebuild. Repro: `ONLY=mouse node suites/ui/loops-dialog.mjs` (check "real drag moves an ordinary node"), or `NOCLICK=1` to compare.
- **FE-T (medium)** — dropping a member on a top-level node outside the Loop box leaves `parentNode=L` in the saved file while the member sits outside the box. `110-dragout-leftover`.
- `loops.mjs` now also contains checks I did not write (someone extended it with a drop-position check and a resize-hit-area check). They fail: "over-another-node preserves the drop position" (drop 700,628, screen final 696,624, saved position {118,177}) and "corner resize hit area..." (the hit area is 24px, the cursor is nwse-resize, so the cause may be the check's own condition), then the scenario crashes reading `getBoundingClientRect` of undefined at loops.mjs:212. I did not change these.

### Design check vs the 3 mockups (remaining deviations)
| Deviation | Severity |
|---|---|
| LOOP label is Roboto 400 16px, not bold monospace as in the mockup | low |
| Collapsed box has a bordered "▸ EXPAND" button and "3 nodes inside" like the mockup, but the expand text is 13px small caps; the collapsed box is 73px high | low |
| The expanded loop shows a "▾ COLLAPSE" button (not in the mockup) | low |
| The condition pill truncates with an ellipsis when the box is narrow (at the zoomed-in view "while vars["hasMor…") | low |
| In the viewer, the carried-value chips cut off at the right edge (scrollable, but the first impression is a cut-off) | low |
| Wires are dashed light and cross the border; selected/nested states look right. The nested inner tint is lighter. | none |
| Fill: now a subtle translucent purple tint (matches the mockup much better than round 4) | none |

### AC coverage (regression, this round)
- `loops.mjs`: 19 PASS (incl. all my original checks until the crash), 2 FAIL and 1 crash from the checks someone added (above).
- `loops-dialog.mjs`: dialog 28 PASS, shapes 10 PASS, visual 7 PASS, collapse 2 PASS, payload 3 PASS, r5resize 8 PASS, r5edges 6 PASS, dbl 5 PASS (+1 expected FAIL: a synthetic `dblclick` event no longer opens the Loop dialog, since the Loop uses the click count now), mouse 7 PASS + 1 FAIL (FE-S), dragout 8 PASS + 1 FAIL (FE-T), run: 2 FAIL (3-iteration live poll is too fast; chip heuristic) and the rest PASS including the 40-iteration final status.
- Note: "Save writes the edited condition" needs Ctrl+S because autosave is off; the dialog Save only dirties the editor.

### Console & network errors observed
Baseline `pageerror: view container is disposed`, favicon 404. No 4xx on `/workflow/validate`.

### Files changed
- `continuum-system-tests/suites/ui/loops-dialog.mjs`: new scenarios `mouse`, `probe`, `r5edges`, `r5resize`, `r5style`, `r5theme`; dragout `DIRS`/leftover and a landing check; the double-click without delay.
- `continuum-system-tests/suites/ui/proxy.mjs`: `/mqtt` route to the mosquitto WebSocket.
- `lib.mjs` and `loops.mjs` were also edited by someone else during the round (`saveWorkflow`, extra checks).
- `.factory/loops/screenshots/round-5/*`. No product code touched.

## Round 6

### Environment
- Workbench: `http://127.0.0.1:3005`, accessed through the user-provided streaming proxy `http://127.0.0.1:3015` (proxy routes API, credentials and MQTT). Workbench running with current frontend changes confirmed by user.
- Headless bundled Chrome 158.0.8127.88 via Puppeteer 25.19.0 (`.factory/tools/node_modules/puppeteer`); Node 24.16.0.
- Test inputs use fresh `systest-<runId>-loops-*` workspaces; run screenshots: `.factory/loops/screenshots/round-6/`.
- Ran `loops.mjs`, full `loops-dialog.mjs`, then focused `ONLY=design`, `ONLY=r5theme`, `ONLY=run` and `ONLY=mouse` scenarios. The last `ONLY=run` run includes the new explicit member-status assertion.

### AC coverage
| AC | Scenario | Result | Evidence (screenshot path) |
|---|---|---|---|
| AC-32 / FE-5, FE-6 | Palette Loop drop, 520x320 default, membership and relative position, ordinary-node click-then-drag, node moves with Loop; member drag-out to right/below/left/above and over an outside node | PASS | `10-loop-dropped.png`, `11-member-in-loop.png`, `13-member-dragout-{right,below,left,above,over-another-node}.png`, `152-ordinary-node-click-then-drag.png` |
| AC-32 / FE-5 | Select and live-resize Loop; visible corner controls and larger hit target; resize persists to saved node/style dimensions | PASS | `15-loop-selected-resizer-handles.png`, `16-loop-resized.png`, `17-loop-shrunk.png` |
| AC-33 / FE-7 | Collapse hides members, persists `collapsed:true`, boundary edges remain drawn; expand restores members; saved edge JSON unchanged; reopened workflow remains collapsed | PASS | `21-collapsed.png`, `22-expanded.png`, `23-reopened-collapsed.png` |
| AC-30 / FE-7 | Boundary edges remain between ordinary nodes; cycle-producing connection refused | PASS | `19-edges-across-boundary.png`, `20-cycle-refused.png` |
| AC-34 / FE-8/10 | Builder/CEL mode, nested condition, round-trip/save and representative condition shapes | PASS | `72-dialog-simple.png`, `73-dialog-cel-mode.png`, `77-dialog-builder-edit.png`, `78-dialog-nested.png`, `84-shape-nested.png` |
| AC-35 / FE-8 | Validation, invalid text, unreachable validator, CEL-only builder restriction/replacement confirmation, empty condition recovery, Loop settings dialog | PASS | `75-dialog-cel-invalid.png`, `79-dialog-cel-only.png`, `80-dialog-replace-clicked.png`, `81-dialog-not-checked.png`, `83-dialog-cleared.png`, `130-dblclick-dialog.png` |
| AC-36 | CEL-only warning badge on the Loop canvas | PASS | `50-badge.png` |
| AC-37 / FE-5, FE-9 | Real 3-iteration run: Loop Warning/final limit status, live `Iteration k of 40`, final 40-iteration state, one-iteration Success, collapsed viewer remains collapsed; member's visible last-iteration status | PASS | `90-run-3-iterations.png`, `90b-run-40-iterations-running.png`, `90b-run-40-iterations.png`, `91-run-1-iteration.png`, `92-run-collapsed.png` |
| AC-37 member status (explicit new assertion) | Expected member status after the real 3-iteration run: Success; actual viewer member `m1` is visible, has `node-status--success`, and text `Conditional Splitter ... Success 1ms` | PASS | `90-run-3-iterations.png` |
| Theme presentation | Builder appearance follows dark and light Theia themes; dark theme restored after check | PASS | `180-builder-dark.png`, `181-builder-light.png` |
| Triple-nested presentation | Three nested Loops render at depth classes 0, 1, 2 with differentiated tint; member remains inside inner loop | PASS | `100-design-nested-3.png` |

### Failures
- **FE-1 (runtime error, low):** expected no uncaught browser errors during the scenarios; the browser recorded repeated `pageerror: view container is disposed` messages (the full dialog run summarized 24 captured errors, including these) and a baseline favicon 404. AC assertions still passed; no loop-specific API 4xx was observed. Context screenshots: `90-run-3-iterations.png` and `100-design-nested-3.png`; the exception itself is in the captured run output, not rendered in the UI.

### Console & network errors observed
- Repeated `pageerror: view container is disposed`; seen previously as baseline Theia noise and repeated here while opening/closing views.
- Favicon request returned 404. No loop validation/API error responses were observed.
- `loops.mjs` logged 6 errors and the full `loops-dialog.mjs` run logged 24 captured errors; the focused design and theme scenarios logged 0.

### Files changed
- `continuum-system-tests/suites/ui/loops-dialog.mjs`: added a real run-viewer assertion for visible member last-iteration Success status and a click-then-drag screenshot.
- `continuum-system-tests/AGENTS.md`, `continuum-system-tests/README.md`: documented the member-status, mouse and theme coverage.
- `.factory/loops/screenshots/round-6/*` and this report. No production code changed.
- Verification: `node --check suites/ui/loops-dialog.mjs`, `npm run check`, and `git diff --check` all PASS.

## Round 7

### Environment
- Workbench: `http://127.0.0.1:3000`, reached through user-provided streaming proxy `http://127.0.0.1:3016` with `PASSTHROUGH=1`. Workbench/frontend build was running as provided; no rebuild was performed.
- Headless bundled Chromium via Puppeteer 25.19.0 (`.factory/tools/node_modules/puppeteer`); Node 24.16.0.
- Fresh `systest-<runId>-loops-*` workspace; screenshots: `.factory/loops/screenshots/round-7/`.
- Ran the focused status-contrast scenario and the complete `ONLY=run` group. The run group includes the established 3-iteration, 40-iteration streaming, single-iteration, collapsed-viewer, and member-status checks.

### AC coverage
| AC | Scenario | Result | Evidence (screenshot path) |
|---|---|---|---|
| AC-37 / FR-27 | Real nested-loop member status differs across outer iterations: capture the nested Loop as Warning while the outer Loop is running, then inspect its final viewer status | PASS: live viewer showed the nested Loop member as Warning in outer iteration 1; after the timestamp condition became false, outer run finished successfully after 8 iterations and the member showed Success | `93-member-status-early-warning.png`, `94-member-status-final.png` |
| AC-37 / FE-9 | Real 3-iteration run, live 40-iteration run and final status, one-iteration Success, collapsed viewer; member last-iteration Success and chip strip | PASS: all assertions in `ONLY=run` passed, including member `m1` visible with Success and compact one-row chips | `90-run-3-iterations.png`, `90b-run-40-iterations-running.png`, `90b-run-40-iterations.png`, `91-run-1-iteration.png`, `92-run-collapsed.png` |

### Failures
- No loop-view assertions failed. The earlier warning and final success are now both visibly evidenced; this closes the FR-27 browser-evidence gap from the prior round.
- **FE-1 (pre-existing runtime noise, still observed):** theia view teardown produced repeated uncaught `pageerror: view container is disposed` messages, and a favicon request returned 404. Assertions passed; no loop-specific API failure was observed.

### Console & network errors observed
- Focused status-contrast run: 6 captured events, including favicon 404 and repeated `pageerror: view container is disposed`.
- Full `ONLY=run`: 30 captured events, same repeated view-teardown errors and 404; no assertion failures.

### Files changed
- `continuum-system-tests/suites/ui/loops-dialog.mjs`: status-contrast fixture now includes a longer-running independent member so the live Warning can be captured; added focused `ONLY=status-contrast` selection.
- `.factory/loops/screenshots/round-7/93-member-status-early-warning.png`, `94-member-status-final.png`, and the `90`–`92` run-view screenshots.
- This report. No production code changed.
- Verification passed: `node --check continuum-system-tests/suites/ui/loops-dialog.mjs`; `npm run check`; `npm test` (55 tests passed); browser run `ONLY=run` (all assertions passed).

# Landing 3D Scroll — Independent Code Review

## Final game positive-control activation — bounded re-review

**PASS.** The positive case now calls the existing `chooseLevel(page, 'Dựng pod đầu tiên')` after opening `/games/k8s` and before the unchanged scene-mount wait. That helper asserts the real level button is visible and clicks it. Script collection already starts before route navigation, so it also captures the renderer chunk requested by level activation. The nonempty scan, Three matcher and positive assertion remain unchanged; no fake scene or relaxed assertion was introduced.

The lead reports the final positive/negative bundle pair **2/2 passed in 12 seconds on the same production build**; `/login` remained clean in both attempts. The earlier positive failure stopped at the level chooser, which did not mount the scene being measured. The activation fix addresses that harness precondition and changes no application source. Review is frozen with no unresolved Critical or Important finding.

## Final harness profile isolation — accepted

**PASS.** The base configuration excludes exactly `**/landing-3d.spec.ts`; the dedicated landing configuration resets `testIgnore:[]` and retains full Chromium, its narrow test match and the unchanged hardware/frame-budget assertions. `landing-visual.spec.ts` remains in both profiles. This separates environment prerequisites explicitly: the hardware suite is not part of generic headless-shell discovery.

Independent discovery used all three required local E2E variables plus `--list --reporter=list`; it did not start a browser or overwrite JSON acceptance results.

| Profile | Total discovered | landing-3d | landing-visual | Exit |
|---|---:|---:|---:|---:|
| Base | 191 tests in 16 files | 0 | 4 | 0 |
| Dedicated landing | 20 tests in 2 files | 16 | 4 | 0 |

The runtime report separately records the actual 20/20 hardware-profile run. Application source approval is unchanged. The older Three negative control is also correctly retargeted from the now-3D home route to `/login`: its script collector, nonempty-scan assertion and Three matcher remain; it verifies the landed path explicitly. The game positive assertions and authenticated `/lessons`/`/dashboard` checks remain intact. The final activation correction and successful two-case execution are recorded above.

## Follow-up re-review — focus and local HTTP redirects

**SOURCE FIXES ACCEPTED.** Inspected the actual patches in `scroll-experience.tsx`, `server/security/headers.ts`, `proxy.ts`, `security/rule-09-headers.test.ts` and the new keyboard regression in `e2e/landing-3d.spec.ts`.

- Explicit chapter navigation now focuses the destination section with `preventScroll:true`, then performs the intended reduced-motion-aware scroll. Sections have `tabIndex={-1}` so they accept this focus without entering the normal Tab sequence. Passive/native scroll paths do not steal focus. The browser regression activates chapter three by keyboard, checks focus belongs to that chapter, then checks Tab reaches its fault control.
- CSP's only behavior change is omission of `upgrade-insecure-requests` when the supplied parsed request URL uses `http:` and its hostname is exactly `localhost`, `127.0.0.1` or `[::1]`. Missing URL, HTTPS loopback, LAN hosts, external hosts and names such as `localhost.example.com` retain upgrading. It does not consult incoming forwarded-host/protocol headers itself.
- Both proxy header application paths pass `new URL(request.url)`: the shared secured-response path covers normal responses, redirects and early errors; the separate preflight path is also covered. HSTS, nonce/strict-dynamic script policy, object/frame restrictions and all other headers are unchanged.
- Ten added proxy regression cases exercise all three allowed HTTP loopback hosts and seven secure/non-loopback origins, including spoofed forwarded headers, and retain nonce/object/HSTS assertions. Existing default-builder/header tests remain. This review inspected these tests; the lead owns their execution and the fresh browser redirect verification.
- Checked the installed Next request-URL construction and current deployment configuration as a trust-boundary trace: the helper receives Next's parsed absolute URL, and the project's Docker runtime is configured with `HOSTNAME=0.0.0.0`, which is outside the exception. No deployment/proxy setting was changed by this patch. The original blanket claim of unchanged CSP is replaced by this explicit, local-only exception.
- Security checklist for this bounded patch: no changed auth/access gate, user-data flow, persistence, dependency or deserialization/XML surface; no URL/header text is interpolated into policy directives; existing script/frame/object controls and HSTS remain. No Critical or Important security finding established. This is not a whole-application security audit.

## Natural-flow revision — current source verdict

**SOURCE REVIEW PASS — no unresolved Critical or Important source finding. Score: 9/10.** The latest user direction supersedes the pinned-theater implementation reviewed below. Current scope: natural page sections, a large 3D model moving between page placements, richer terminal scroll presentation, resize/lifecycle/reduced-motion boundaries, the narrowly scoped local-HTTP header correction and changed tests. Historical approvals below apply only to their recorded implementation. The current source review and independent delta scout are complete; the focus and CSP follow-up corrections are accepted above.

### Current findings and corrections

- **Resolved — chapter buttons retained keyboard focus in the departed first section.** The original natural-flow handler only called `scrollIntoView`, so the next Tab could return to the old navigation. The final handler focuses the target section with `preventScroll` before navigating and makes each section programmatically focusable. Native scrolling does not run this focus transfer. The focused browser regression is described above.
- **Resolved — invisible anchor overflow.** The first natural-flow CSS placed empty 30%-wide anchors at negative right offsets, extending scrollable page width even though the actual renderer was a fixed canvas. Final `experience.module.css:319–350` keeps every measuring box within the page, using left/right zero and 20%/30% widths. The model may still visually approach the viewport edge through its projection; the DOM no longer needs out-of-bounds boxes.
- **Resolved — stale geometry after late shell/content layout.** Initial caching observed only the outer page and fixed-size anchors. A late authenticated `CapacityFullBanner` above `<main>` could move the page without resizing those targets. Final `scroll-experience.tsx:213–217` also observes `document.body` and each stable section wrapper, invalidating cached document coordinates on banner/streamed-content size changes. The same observer disconnects on cleanup; no continuous geometry polling was added.
- Native HTML controls continue to operate the illustrative event state and terminal example locally. The only security-policy change is the explicit HTTP loopback upgrade exception reviewed above; auth, APIs and persistence behavior are unchanged.

### Current source evidence

- All four narrative sections remain in normal DOM flow and always readable. There is no sticky/pinned narrative container or scroll-height spacer. The fixed element is a transparent, pointer-ignoring canvas layer; section coordinates drive the model inside it. The progress strip is also presentational.
- `sampleJourney` interpolates measured document anchors with quintic easing. It subtracts the current scroll offset from model document y, preserving vertical drift and letting endpoints move offscreen. Forward/reverse paths use the same pure function. Lower product sections supply additional position/state/opacity anchors to the existing canvas.
- Geometry reads use untransformed section/anchor wrappers and are batched before style writes. Scroll changes are coalesced into one RAF; measurements are refreshed by resize notifications. Scene placement goes through orthographic `setViewOffset`, while material/lighting coordinates stay unchanged. Increased yaw is still driven by bounded progress; there is no autonomous animation loop.
- Scene lifecycle, palette correction, visible-loading deadline and reduced-motion suppression remain intact. HTML headings, controls, the four static schematics and product content remain available without WebGL. Cleanup covers the new scroll/resize/visibility/pointer listeners and observers.
- Terminal scroll measurement reads `workbenchFrame` and writes its child surface, avoiding feedback from the surface's own transforms. Scroll only adjusts visual CSS variables/stage; only the Run control sets `hasRun`. Result animations are finite and disabled by reduced-motion CSS. Hidden/offscreen scheduling is gated, pending RAF and subscriptions are removed on unmount, and the final callback checks nullable nodes before use.
- Inspected five full-page motion tests cover reverse travel, offscreen endpoints, lower-page transitions, empty/coincident/zero-size measurements and bounded section depth. Inspected terminal tests retain Run/Reset/topic behavior and add reverse visual scrubbing without execution, cleanup and reduced-motion checks. The lead/owners report these focused suites passed; this review did not duplicate their execution.

### Current verification boundary

`git diff --check` passed for the revised source and follow-up diff. Independent delta scouting completed using the existing scout: [edge-scout.md](harness/2026-09-13-landing-3d/edge-scout.md). It established no additional confirmed source defect; the reviewer subsequently verified the focus correction and scoped security patch. A candidate stale canvas after scrolling wholly past the experience is unreachable in current page composition because every landing child, including the closing section, is inside the experience and AppShell has no trailing content. The fresh production build, actual GPU frame timings, no-overflow result and model/text visual collision checks remain with the runtime verifier and lead; historical SwiftShader timings do not describe the revised hardware-rendered result.

## Historical pinned-theater source review

The following sections preserve the earlier review and production-palette failure history. Their pinned-layout design is superseded by the current natural-flow verdict above.

## Production palette correction — bounded re-review

Verdict: **SOURCE FIX ACCEPTED** after a bounded re-review of `experience-palette.ts`, `experience-palette.test.ts` and its integration in `experience-scene.tsx`.

The first actual production run exposed a failure missed by the initial source review: Lightning CSS serialized the root RGB custom properties as hex, but the renderer accepted only strings beginning with `rgb(`. That valid palette was rejected before GPU rendering, leaving the schematic visible. The correction is necessary; initial source approval did not establish production rendering.

- The parser now accepts exactly 3/6-digit hex or three bounded RGB channels, normalizes comma/space and percentage forms to Three-compatible RGB, and rejects missing, unsupported, non-finite or out-of-range values. It does not substitute white on failure.
- The scene reads the computed root values through `readJourneyPalette` and preserves the existing failure path for an incomplete palette. The palette helper imports the geometry module's type only; it adds no eager Three dependency to the shared shell.
- The 16 inspected regression cases include the actual ten production hex tokens, exact `THREE.Color` color results, 3-digit hex, both RGB syntaxes, percentages, malformed values, out-of-range channels, unsupported alpha/OKLCH and missing-token rejection. The old RGB-only behavior is explicitly identified as rejecting all ten production inputs. The lead reports these tests, scoped ESLint, type checking and token gates passed; this bounded review inspected the evidence/code and did not duplicate the test run.
- The parser and scene integration close the established source cause. The next fresh production browser run must still demonstrate `data-scene-state="ready"` and real colored canvas frames; that runtime result is not claimed by this re-review.

## Scope and preparation

- Scope is the current landing diff only: lazy 3D scene/models, native-scroll HTML controller, copy, scene tokens, OG image, focused browser tests and design documentation. Auth, database and arena behavior are outside the diff.
- Read the accepted plan `plans/reports/2026-09-13-landing-3d-scroll.md`, `apps/web/AGENTS.md`, review/edge-case protocols and applicable `.claude/rules` files. This checkout has no `.Codex/t1k-activation-*.json` and no `docs/code-standards.md`; `.claude/t1k-activation-model-router.json` contains no applicable requested model override. No domain-specific reviewer agent exists; the two discovered reviewer definitions are generic.
- Latest user instruction explicitly authorizes meaningful scroll-driven 3D. The earlier no-3D design restriction is superseded; meaningless white rings and card grids remain excluded by the accepted plan.
- Shared contract uses mutable progress/pointer refs plus explicit demand-render invalidation and discrete event state. RGB tokens at the global theme boundary avoid passing unsupported OKLCH strings to Three.

## Review coverage and runtime boundary

- Final scene and UI source were reviewed after their owners reported readiness. The lead's final loading-deadline correction was checked separately after source freeze.
- Mandatory independent Explore scouting completed: [edge-scout.md](harness/2026-09-13-landing-3d/edge-scout.md). It independently traced scroll inversion, lifecycle cleanup, reduced motion, fallback and fault routing, and established no additional actionable defect.
- Browser proof must cover actual rendered stage differences, native reverse scrolling, fault routing, idle/offscreen/hidden sleep and wake, reduced motion, unavailable WebGL, context loss and failed lazy chunks. Current prepared tests cover a subset; gaps were sent to the lead before execution.
- Performance timings and visual acceptance are not established by source review. A passing draw-count assertion alone does not establish visibly different stages or smooth animation.

## Code Review: source contract and lifecycle

### Critical (must fix)

- None established in the reviewed source. No authentication, persistence, untrusted HTML, external model/texture URL or server mutation was added by this diff.

### Important (fix before merge)

- **Resolved — background-tab startup could falsely fail WebGL.** `scroll-experience.tsx:129–133` initially started the 15-second loading deadline without checking active/visibility. A hidden startup could suspend the scene RAF while the deadline eventually fired. The final effect requires `active`, depends on its changes and clears the timer on deactivation; it starts a fresh deadline on visible activation. Source correction verified directly after the lead's edit.
- **Resolved — landscape controls below viewport.** `experience.module.css` originally combined sticky `top:57px` with `min-height:710px` at 768–1023px widths, putting the stage controls below a 600px-high viewport throughout the sticky interval. The owner added a dedicated `min-width:768px` / `max-height:740px` compact layout with `min-height:0` and footer positioned within the viewport. Source correction is verified; actual 768×600 regression evidence remains the runtime lane's responsibility.
- **Resolved — incident copy and scene disagreed.** The initial scene only tilted/recolored the failed node while the copy said requests moved to its peer. The final scene has a fourth route to the surviving node; fault interpolation reveals that connection and packet, suppresses the original request packet, and dims its link. Recovery reverses the same interpolation.
- **Resolved — persistent document heading.** The lead caught the only `h1` inside a stage-hidden wrapper. The final controller keeps `h1#home-title` outside those wrappers and only changes its visual class after stage zero; subsequent stage headings remain `h2`. The hero below the experience is also `h2`.

### Boundary and edge-case evidence

- Native progress is derived from outer section geometry and actual sticky height/top, clamped to `[0,1]`, and reversed through the same mapping. Navigation uses the inverse geometry and native `scrollTo`; it does not update stage independently of actual scrolling. Chapter three targets 0.94 so its controls remain inside the sticky interval.
- Scroll/resize listeners are passive and coalesced into one RAF. Cleanup removes both listeners, disconnects ResizeObserver and cancels the pending RAF. Scene invalidation is explicitly registered and unregistered; ref updates do not rely on React renders to wake `frameloop="demand"`.
- Intersection and document visibility feed scene `active`. A hidden/offscreen scene can finish its already-queued frame, then stops self-invalidating; waking gets a fresh invalidation through the active-prop effect. No perpetual timer/fan/particle loop was introduced.
- Frame updates use delta-based damping, capped elapsed delta after idle, bounded pointer rotation and a settled threshold. Reduced motion suppresses WebGL in the controller and defensively zeroes scene pointer targets if the scene is directly used with reduced motion.
- Ready notification follows the first scene frame in a cancellable RAF. Context-loss listener calls the HTML fallback path and is removed on cleanup. Owned merged geometry and tube geometry have disposal effects; R3F remains owner of the canvas/material tree.
- A Client Component owns `dynamic(..., {ssr:false})`, matching installed Next documentation. ErrorBoundary and a 15-second loading deadline preserve the schematic, headings, controls and lower-page CTA on renderer/chunk failure.
- Palette is intentionally identical in both application themes. Reading its root RGB tokens once is consistent with this design; no theme watcher is required until theme-specific journey values are introduced. Shared layout does not import Three, and existing real catalog/CTA integration stays server-driven.

### Minor / Suggestions

- Model geometry and CSS are long declarative files. A separate quality-constant object would make tuning damping/DPR/detail/settling thresholds easier, but duplication or a runtime defect is not established by file length alone.
- Build/bundle, visual quality, actual GPU timings and browser accessibility require runtime evidence and are not certified by the source review.

### Score: 9/10

Four source issues discovered during development/review are resolved, including the lead's heading finding. The subsequent production RGB-to-hex failure is also corrected by the reviewed parser and regression suite above. Independent edge scouting found no additional actionable source defect. `git diff --check` passed during the initial final source review. No security/API/data-integrity change was introduced by the bounded landing diff. This is approval of the reviewed source contracts and corrections; it does not substitute for the runtime verifier's final build, screenshots, frame measurements or browser results.

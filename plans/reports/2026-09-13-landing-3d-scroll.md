# Plan: Landing 3D theo tiến trình cuộn

## Latest user correction: continuous full-page flow

The pinned theater is rejected. All sections must move naturally with vertical scrolling; model position and assembly must follow the full page rather than remain in one small region. Replace hidden chapter swapping with normal-flow sections. One viewport canvas follows measured scene-anchor positions, moving between right/left/full-width compositions; its camera-aligned group receives optional `placement.current = {x, y, scale}` (viewport center fractions, offscreen coordinates allowed). Keep raw progress and explicit demand invalidation. Extend scroll effects to catalog/curriculum/practice/closing sections and rebuild the terminal as a colorful workbench with scroll-linked pipeline progress. Native input, accessible content, reduced-motion, WebGL failure, loading and sleep/wake remain required. Earlier 17 passing tests describe the superseded pinned layout and do not close this correction. Software SwiftShader p95 was150.1ms, not smoothness acceptance; measure supported hardware and optimize geometry before making performance claims.

Status: **VERIFIED AND READY FOR LOCAL COMMIT**, 2026-09-13. Original architecture owner: scroll_design; tracking owner: scroll_finalize. All four implementation/verification milestones below are complete. The coherent natural-flow production run passes **20/20**, with zero failures, skips or retries on build `I7eYNXwmu3q9KzrnjDpAr`; all five finalization artifacts validate with zero errors or warnings. The local commit remains with the lead; no production deployment is claimed.

## Latest direction — authoritative revision

The page must move naturally as the user scrolls, with animation participating throughout the landing rather than confining the experience to one pinned theater. A colorful terminal must also respond visually to scrolling and interaction. The preceding localized implementation is an intermediate iteration; its passing source/build checks do not close this request.

- Replace the pinned theater with naturally flowing chapter sections. Preserve ordinary document scrolling, keyboard access, readable headings and real CTA/catalog navigation.
- Reuse one GPU canvas and the meaningful workstation/container/cluster models. Coordinate model positions, camera composition and progression with sections across the page, including later content; do not create a separate renderer for every section.
- Connect viewport visibility and scroll progress to chapter transitions and later-section events. Sleep when inactive; preserve the explicit demand-render invalidation bridge and reduced-motion/static fallback.
- Extend the terminal presentation with a richer palette and scroll-linked pipeline/event effects while preserving its explicit demonstration disclosure, actual run/reset/topic controls and meaningful HTML state.
- Keep the existing boundaries: no meaningless white ring, card-grid layout, scroll hijacking, fake live backend state or weakened CSP/bundle gates.
- Revised acceptance requires actual full-page scroll evidence: naturally moving content, visibly changing models across multiple page sections, colorful terminal event behavior, mobile/keyboard/reduced-motion/fallback checks and fresh production bundle/performance measurements.

### Revised execution tracking

| Work | Status | Dependency / owner boundary |
|---|---|---|
| Review the full-page direction and integration contract | Complete | Shared progress, placement and demand-render invalidation contract; accepted natural-flow architecture |
| Natural-flow narrative and colorful interactive terminal | Complete | Four normal-flow chapters and five lower-content anchors; colorful terminal pipeline scrubs without executing commands; explicit Run/Reset/topic behavior retained |
| Models and cross-page scene transitions | Complete | One pointer-ignoring GPU canvas follows measured anchors; large alternating models, assembly, camera orbit, forward/reverse travel and incident/recovery |
| Full-page runtime, source review and docs | Complete | Source review 9/10; production build, 60/60 focused tests, freshly rerun copy 63/63, lint/typecheck and bundle/token/antipattern gates pass. Coherent natural-flow browser run 20/20, zero failures/skips/retries; docs describe the implemented flow |

Repository finalization: the lead directly invoked `workflow-artifact-gate/validator.cjs` at stage `finalize`; all five authored artifacts pass with zero errors or warnings. Local commit is ready. The task's commit records this work; the plan does not embed its own commit hash.

The UI, model and terminal lanes completed their bounded rewrites without changing auth or persistence. Design documentation now describes the full-page composition. Final acceptance uses the revised source; the earlier pinned-scene tests remain historical.

The revised runtime checks exposed two bounded issues now corrected and independently re-reviewed: chapter navigation focuses its destination section before scrolling, and HTTP loopback responses omit `upgrade-insecure-requests` to avoid redirecting the required local test base to unsupported HTTPS. That exception applies only to exact `localhost`, `127.0.0.1` and `[::1]` HTTP request URLs. HTTPS, LAN/external hosts, missing URLs and other CSP/HSTS controls retain their existing behavior. Ten added proxy origin/forwarded-header regression cases are included in the final 60-test run.

Final-build bundle gate: shared **1,050,883 B / 1,150,000 B**, with xterm on 4/4 terminal routes and absent from 33 other routes. Standalone app/E2E typecheck, token gate (567 files, four explicit exemptions) and antipattern gate (612 files, four exact Arena exceptions) pass after the final build. Actual runtime resources include **16 JS chunks, 679,373 encoded body bytes, 2,438,813 decoded body bytes and 684,173 transfer bytes**; the entry manifest does not include every lazy Three/R3F chunk and is not the total downloaded JavaScript.

The coherent final run measured RTX 4060 Direct3D11: **180 RAF samples / 181 draw frames**, median **4.2 ms**, p95 **12.5 ms** against the 32 ms target, maximum **33.4 ms**, and **zero observed long tasks**. DOM LCP was **216 ms** (`SPAN`), measured separately from canvas. These are local desktop measurements, not universal GPU/mobile performance. The earlier 8.4 ms isolated probe and 20.8 ms case in the incomplete run remain historical.

The final 20-case run took **144.9 seconds**. Six axe scans reported zero violations, but all six retained color-contrast incomplete checks; this is not comprehensive contrast/WCAG certification. Native wheel and touch moved the document, the hero moved out of view, and the model slept both at the initial scene (220→220 draws) and a lower-page scene (369→369), then woke after input. Actual image receipts and detailed scope are in the runtime report.

The first full natural-flow run was 19 passed / 1 failed because CDP's synthetic scroll gesture did not move even a plain-page positive control. Native touch start/move/end dispatch moved that control 425 px and passed the focused app case; the coherent 20-case rerun then passed on unchanged production source. This harness correction and the prior palette/loopback failures remain in the runtime history.

## Previous localized iteration — historical execution evidence

| Phase | Status | Verified deliverable |
|---|---|---|
| 1. Contract and visual direction | Complete | Shared scene/controller contract; four meaningful stages; reviewed native-scroll and lazy-rendering architecture |
| 2. Isolated 3D scene | Complete | Procedural workstation, container and server-cluster models; demand rendering; incident/recovery routing; production palette parser with 16 passing regression tests |
| 3. Narrative and integration | Complete | Scroll/stage controls, persistent HTML heading, readable schematic fallback, copy and existing catalog/CTA integration; marketing/copy gate 14 tests and copy package 63 tests pass |
| 4. Verification and documentation | Superseded before final acceptance | Fresh production build `PfM_XYvnckD1HkWTldcWM`, lint/typecheck and token/antipattern/bundle gates pass; independent source review 9/10. First real WebGL visual test 1/1 passes and lead inspected stages 0, 1, 3 and fault routing; full 17-test run and final frame results were pending when the direction changed |

The first production browser attempt failed before rendering: CSS minification emitted valid hex colors that the original RGB-only adapter rejected. The corrected parser accepts bounded RGB and 3/6-digit hex, has 16 passing regression cases and passed independent re-review. That corrected production build supported the localized iteration's first rendered test; the revised full-page implementation requires its own fresh build. The failed attempt remains in the runtime report.

Implemented refinements to the original contract: reduced motion uses the readable static schematic with all HTML controls; the journey palette is deliberately identical in both app themes, so it does not require a theme observer; no GSAP, Lenis, Locomotive, downloaded model or texture dependency was introduced. The existing native-scroll mapping and explicit R3F invalidation bridge provide the requested behavior. Original quality figures below are design targets unless final browser evidence records a measurement.

Historical localized-build bundle gate: shared **1,050,433 B**, below the unchanged 1,150,000 B ceiling; xterm was present on 4/4 terminal routes and absent from 33 other routes. The route manifest omitted the newly lazy-loaded Three scene chunk, so its home entry was **not the page's total runtime transfer size**.

Final evidence: [completion report](../../reports/2026-09-13-landing-3d-completion.md), [runtime acceptance](../../reports/2026-09-13-landing-3d-runtime.md), [independent source review](../../reports/2026-09-13-landing-3d-review.md). Historical P16 reports remain unchanged.

## Previous localized iteration — original architecture contract

The following research and design record describes the earlier localized composition. Where it conflicts with the latest direction above, the latest direction governs. Retained implementation constraints and prior verification remain useful, but pinned layout and single-region acceptance are superseded.

### Research and exact requirements

- Project: Next 16.3 App Router, React 19, pnpm monorepo. Home is a server component composing marketing components. Three 0.185.1, R3F 9.7 and Drei 10.7 are already installed for K8s Arena.
- Reuse: current Hero/HomeCta, LabPreview, CatalogStats with independent Suspense, Curriculum, ValueProps and GettingStarted remain meaningful content. `packages/motion/src/use-reduced-motion.ts` supplies live reduced-motion preference. Existing arena code documents CSS-color conversion and demand-frame concerns; do not import arena gameplay or session state into home.
- Existing standards: `docs/design-system.md`, `docs/design-guidelines.md`, `docs/bundle-budget.md`. `docs/code-standards.md` and `docs/system-architecture.md` do not exist. No `.Codex/t1k-activation-*.json` files exist in this checkout. `apps/web/AGENTS.md` and the installed Next lazy-loading/server-client-boundary guides were read.
- Output: colorful, detailed, interactive WebGL storytelling driven directly by vertical scroll, with readable HTML content and real catalog/CTA integration.
- Acceptance: four visibly different narrative states, reversible progress, explicit incident/recovery interaction, intentional camera transitions, supported keyboard/mobile/reduced-motion/fallback, visual evidence and unchanged performance gates.
- Scope: landing presentation and required tests/docs only. Backend, auth, published curriculum and K8s Arena behavior are unchanged.
- Non-negotiable: no meaningless white torus/ellipse, card-grid composition, fake live backend states, scroll hijacking or weakened CSP/bundle gates. The latest user request explicitly replaces the previous prohibition on landing 3D; update those two docs accordingly.
- Touchpoints: home copy keys, marketing styles, globals palette, client/server import boundary, guest landing E2E harness and per-route bundle.

## Visual narrative

One sticky sculptural diorama follows an application from a command to a running cluster. Desktop uses a large scene beside short editorial stage text; stage markers are a narrow progress rail, not boxes. The model changes through assembly, physical movement and camera composition; the canvas never becomes a slideshow of identical cubes.

| Normalized stage | Meaningful form | Scroll event / visual change | HTML explanation |
|---|---|---|---|
| 0–0.25 | Sculpted workstation, monitor bezel, screen, keyboard and small command tiles | Camera approaches workbench, command tiles leave screen and form build layers | Start from a command and build an application |
| 0.25–0.50 | Cyan/teal shipping containers with corrugated sides, doors, seams and corner brackets | Layers assemble into containers; lids and grouped artifacts settle on a platform | Package the same application with its dependencies |
| 0.50–0.75 | Violet/amber server cluster with rack slots, vents, fan blades, LEDs and connected cables | Containers move to distinct nodes; cables illuminate in direction of delivery | Schedule and connect application instances |
| 0.75–1 | Balanced cluster with green readiness signals and completed delivery path | Nodes settle, health lights stabilize; optional fault/recovery changes one node and its replacement | Observe failure, restore a healthy desired state |

Materials: satin colored surfaces, darker edge details, restrained glossy highlights and directional lighting. Use dimension, silhouette, bevels and shadows to make models readable; no external HDRI, texture, GLB or font requests needed. The actual terminal demo remains below the story and continues to disclose simulated output. All illustrated cluster states explicitly belong to a demonstration, not a live sandbox.

## Architecture and exact integration contract

Root owns `apps/web/src/components/marketing/experience-contract.ts`. It is the sole source for:

```ts
export type JourneyEvent = 'idle' | 'fault' | 'recovered';
export interface JourneySceneProps {
  progress: { current: number }; // Clamped raw target, 0..1.
  pointer: { current: readonly [number, number] }; // Normalized -1..1; neutral [0,0].
  event: JourneyEvent;
  active: boolean;
  reducedMotion: boolean;
  onReady: () => void; // First successful scene frame, not merely import resolved.
  onError: () => void;
  onInvalidateReady: (invalidate: (() => void) | null) => void;
}
```

The scene exports default `ExperienceScene` from `experience-scene.tsx`. Wrapper dynamically imports it with `ssr: false` inside a Client Component, as required by the installed Next version. Narrative headings, stage descriptions and CTA remain server-renderable HTML. No Three imports flow through shared layout or server catalog modules.

Data flows:

1. Native scroll/resize → UI controller reads scroll-container geometry → clamp target progress → write ref → call the registered invalidate function. No React state updates on every scroll frame. React stage state changes only on stage boundaries.
2. Fine pointer move → normalized pointer ref → invalidate. Pointer leave resets it. Coarse/touch pointer does not steal pan gestures.
3. Scene `useFrame` → delta-time exponential damping → apply model/camera transforms in place → invalidate only while unsettled and active. Raw refs alone do not wake demand rendering; the explicit invalidate bridge is mandatory.
4. Incident/recovery button → discrete JourneyEvent → scene node state and HTML status. Button/copy makes simulation explicit; live region announces only user-triggered discrete events, not every scroll frame.
5. Theme → CSS RGB scene tokens from `globals.css` → lazy scene adapter → material colors. Raw color values belong only in globals. Observe theme changes and invalidate; do not pass OKLCH strings directly to `THREE.Color` because this can leave objects white.
6. Intersection/visibility → active flag. Offscreen or hidden scene sleeps, waking at the current scroll state. Unmount removes observers/listeners, unregisters invalidation with null and disposes owned GPU resources.

Native scrolling plus R3F demand rendering is selected. GSAP/Lenis/Locomotive add an unnecessary controller here; the user requested the behavior and offered these libraries as approaches. Scroll targets use native anchor/scroll APIs with reduced-motion-aware behavior. No fixed-body or transformed global scroll container.

## Responsive, accessibility and fallback

- Desktop: scene is dominant; text occupies a clear quieter column, never overlays detailed models. Keep 44 px controls, visible focus, a skip-to-curriculum link and real headings.
- Mobile 320–767 px: scene uses a shorter sticky stage above/beside natural narrative; camera framing changes to protect object silhouettes. Avoid a full-screen canvas plus full-screen sticky text that makes controls unreachable. Verify 390 and 768 px, both themes, browser chrome height changes and no horizontal overflow.
- `prefers-reduced-motion`: immediate stage poses, no pointer parallax, damping, continuous fans/particles or programmatic smooth scrolling. HTML story and event buttons remain usable. A user motion toggle, if included, can only reduce motion further than OS preference.
- Canvas is presentational and excluded from tab order. All meaningful state is duplicated in real HTML. Stage navigation uses buttons/anchors, with current stage exposed accessibly; do not announce every incremental scroll update.
- Loading, failed dynamic chunk, unavailable WebGL and context loss share a designed static HTML/CSS illustration plus unchanged story, controls and CTA. A tiny reserved fallback keeps layout stable. Failure cannot leave an empty sticky region or perpetual loading indicator.
- Keep app CSP unchanged. Use existing local fonts and procedural geometry. No network connection or metric is implied by the illustration.

## Phases

- Phase 1: Contract and visual direction — ROOT owns `experience-contract.ts`, global scene tokens and app integration | Effort: S
- Phase 2: Isolated 3D scene — scene agent owns `experience-scene.tsx`, model/palette/pure state helper files and their focused unit tests | Effort: M
- Phase 3: Narrative and integration — UI agent owns experience wrapper/controller/CSS and relevant marketing components; ROOT owns `packages/copy/src/surfaces/home.ts`, `app/page.tsx` and globals after contract. Root copy namespace: `home.journey.*`, stage0..3 fields kicker/title/body/command/status, global heading/accent/lede/scroll/label/skip/fallback/reduced/fault/recover/idle/fault-status/recovered-status/disclosure | Effort: M
- Phase 4: Verification and documentation — verification agent owns dedicated guest landing E2E spec/config, root owns final build/integration and docs sync | Effort: M

## Feasibility

- Reuse check: React Three Fiber, Three.js, Drei and motion package already installed; existing landing and catalog data reusable.
- Complexity: moderate.

## Dependencies

- Blocks: final browser acceptance and bundle build.
- Blocked by: exact scene integration contract. Scene and narrative can then run in parallel.

## Risk Assessment

| Risk | Likelihood (1–5) | Impact (1–5) | Score | Mitigation |
|------|------------------|--------------|-------|------------|
| Another visually arbitrary scene disappoints user | 4 | 5 | 20 | Before scene phase: agree the four meaningful silhouettes above; capture actual WebGL screenshots at each stage and inspect full scene, not just DOM pass |
| GPU cost or render loop causes visible scroll jank | 4 | 4 | 16 | Before scene phase: demand rendering, explicit wake/sleep contract, named quality constants; begin without postprocessing, cap DPR and share repeating geometry/materials |
| Animation ignores reduced-motion or blocks native touch/keyboard | 3 | 5 | 15 | Before UI phase: native scroll only, live reduced-motion hook, HTML controls/fallback, no canvas input capture; test keyboard and touch-sized layout |
| Lazy Three increases shared route bundle | 3 | 4 | 12 | Client-only dynamic import, no shared-layout dependency; rerun fresh production bundle gate without raising ceilings |
| Mutated refs never wake frameloop demand | 3 | 4 | 12 | onInvalidateReady contract; negative-control test verifies progress changes after initial idle |
| White/incorrect model colors after theme change | 3 | 4 | 12 | Root RGB scene tokens plus conversion adapter; both-theme actual canvas screenshots |
| Lost WebGL or lazy chunk leaves blank opening | 3 | 4 | 12 | Error boundary, canvas fallback and contextlost path preserve HTML/fallback; force each failure in browser |
| Concurrent agents overwrite shared files | 2 | 4 | 8 | Root owns contract/globals/page; scene and UI own disjoint files; any naming change sequenced through lead |

## Timeline

| Phase | Effort | Notes |
|-------|--------|-------|
| Contract | S | First |
| Scene | M | Parallel after contract |
| Narrative | M | Parallel after contract |
| Verification/docs | M | After integration |
| Total | S + 3M | Critical path: contract → scene + narrative → browser verification |

## Verification matrix and objective success criteria

All browser commands use explicit `E2E_START_SERVER=1`, `E2E_BASE_URL=http://localhost:3000` and `E2E_ORIGIN=http://localhost:3000`. Dedicated guest config must avoid the existing role/session global setup so landing tests do not require sandbox credentials; retain the existing maintained local server helper.

Expose stable experience/stage identifiers and `data-scene-state="loading|ready|fallback"` plus current-stage metadata for verification; these describe actual runtime state, not test-only behavior. Existing terminal-demo tests remain. Canvas frame measurement is separate from LCP because canvas content cannot be an LCP candidate.

| Phase | Pass/fail verification | Evidence / rollback |
|---|---|---|
| Contract | `pnpm --filter @devops-platform/web typecheck`; no duplicate prop/event declarations | Type import at both UI and scene consumers. Root can revert contract with its two consumers atomically |
| Scene | Focused Vitest pure progression tests: clamped endpoints, four stages, reverse scroll, finite transforms, idle/fault/recovered; render lifecycle tests or browser proof of sleep/wake | No model/controller files outside scene ownership. Revert scene package to designed fallback without losing narrative |
| Narrative | Marketing/copy focused Vitest, `pnpm --filter @devops-platform/web lint`, token/antipattern gates | Existing demo run/reset still works, CTA/curriculum links unchanged; revert wrapper/integration together |
| Runtime | Dedicated Playwright guest spec/config exercises progress0/0.33/0.67/1 and reverse scroll; fault/recovery; stage navigation; keyboard; 390/768/1440; both themes; reduced-motion; forced WebGL and chunk/context-loss fallback | Screenshots at four scene states plus mobile, error console/CSP empty, actual canvas nonblank and visibly different states |
| Build/bundle | `pnpm --filter @devops-platform/web build`; `pnpm bundle:check` | Same shared1,150,000 B / route1,850,000 B budgets. Roll back landing imports if exceeded; no silent ceiling increase |
| Performance | Desktop native-scroll frame sampling after load, scene wake-to-target latency, idle/offscreen frame observations; existing home LCP gate under2,500ms | Report actual device/browser and p95 frame interval; target60fps on test desktop, p95 ≤32ms, idle settles ≤1s. Do not claim universal smoothness from headless timings |
| Docs/review | `git diff --check`; independent review of dependency boundary, lifecycle, no SSR/copy/CSP changes | Update two design docs so latest user instruction owns landing3D; preserve historical P16 reports |

Quality constants live in a small named configuration module: camera/stage ranges, damping, settled epsilon, DPR cap (start1.5 desktop,1 mobile), geometry detail, draw-call target and event duration. Target fewer than150 draw calls and100k visible triangles; reduce repeated detail via shared geometry/instancing if measurements exceed this. These are implementation targets to verify, not measured claims. No arbitrary value repeated across controller and renderer.

## Review checklist and rollback

- Data sources, mutable sinks, lifecycle and material/theme owner are explicit above.
- Dependency graph: contract → scene and UI in parallel → root integration → browser/build/review → docs. No two agents own the same source path.
- Additive landing behavior; no backend/route/public package API migration. Existing marketing exports retained where imported; deleted copy keys require a reference search.
- Every high-risk row has a mitigation required before its implementation phase.
- Rollback is localized to landing scene/wrapper/copy/globals additions; no data migration and no change to live sandboxes. Keep authored source history and preserve user root image files.
- Final completion requires actual rendered-model inspection and test evidence. Plan/source correctness cannot certify a beautiful scene.

## Sources consulted

- Installed Next guides: `apps/web/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` and `server-and-client-boundary.md`: `ssr:false` must be in a Client Component; all meaningful HTML remains prerendered.
- [R3F scaling performance](https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/docs/advanced/scaling-performance.mdx): demand rendering needs explicit invalidation when refs mutate; reusing geometry/materials reduces renderer overhead. This supports the controller/scene contract and sleeping behavior.
- [R3F Canvas API](https://raw.githubusercontent.com/pmndrs/react-three-fiber/master/docs/API/canvas.mdx): canvas rendering settings and unsupported-WebGL fallback.

# Landing 3D Independent Edge Scouting

Bounded source inspection of the five landing experience files. No application files, tests, or commits changed.

## Critical (must fix)

No concrete critical defect established in this bounded inspection.

## Important (fix before merge)

No concrete important defect established in this bounded inspection.

## Minor / Suggestions

No actionable source finding established. This is an independent edge scout, not a complete approval.

## Evidence and completed checks

- [x] Native-scroll inversion and reverse traversal: `scroll-experience.tsx:145-149` computes clamped progress and derives the chapter directly from current position; `195-207` inverts the same bounds, sticky top, and distance. Chapter targets 0, 1/3, 2/3, and 0.94 map to chapters 0, 1, 2, and 3. The stage ref only suppresses redundant state updates and does not prevent reverse transitions.
- [x] Offscreen and hidden demand scheduling: `scroll-experience.tsx:173-192` combines intersection and visibility, and cleans both subscriptions. `experience-scene.tsx:107-114` gates externally registered invalidation on the current active prop, deregisters it, and cancels pending ready notification. `127-133` wakes after active changes; `224-229` prevents an inactive or settled scene from recursively invalidating.
- [x] Scroll/resize cleanup: `scroll-experience.tsx:156-170` coalesces measurement in one RAF and removes both listeners, disconnects the resize observer, and cancels pending work.
- [x] Fallback branches: `scroll-experience.tsx:39-54` catches descendant failures; `129-133` limits initial scene loading to 15 seconds with cleanup; `304-319` removes the renderer for reduced motion or fallback and renders the semantic schematic. `experience-scene.tsx:52-56` rejects an unavailable palette; `117-124` handles and cleans up context-loss notification.
- [x] Fault/recovery routing: `scroll-experience.tsx:274-299` allows fault, disables redundant fault, enables recovery only after fault, and reports the selected event. `experience-scene.tsx:142-195` blends the alternate route, suppresses the primary incoming packet under fault, and restores both on recovery; `262-275` changes the primary server status while preserving the secondary. `experience-models.tsx:428-433` defines the new route from the container side toward the secondary server.
- [x] Geometry lifetime: `experience-models.tsx:55-59`, `262-278`, and `445-449` dispose temporary and retained geometry on the applicable lifecycle paths.
- [ ] Browser validation of reverse scrolling, media preference toggles, unavailable WebGL, failed chunks, GPU context loss, and actual settled/offscreen render counts. Runtime tests were outside this source-only subtask.
- [ ] Broader codebase/API contract/security review. Scope was restricted to the five named landing source files.

## Summary

The requested independent source checks did not establish a new concrete defect. Known heading, landscape controls, and alternate-route fixes were not re-reported. Runtime outcomes remain unchecked here and must come from the runtime verifier.

## Score: N/A

Exploratory source scout only; no whole-change verdict or numerical quality score assigned.

## Natural-flow delta edge scouting

Completed bounded inspection of `full-page-motion.ts`, `scroll-experience.tsx`, `experience.module.css`, and the placement handling in `experience-scene.tsx`. No new concrete finding established by this scout. The parent reviewer separately owns the chapter-navigation keyboard-focus finding.

### Critical / Important

No additional confirmed defect from the independent delta inspection.

### Completed checks and evidence

- [x] Natural document flow: `experience.module.css:43-52` gives chapters ordinary grid layout and content-driven minimum height. The only fixed elements are the transparent scene layer (`8-13`) and progress indicator (`247-254`); no theater pin or synthetic multi-viewport spacer remains.
- [x] Position cache refresh: `scroll-experience.tsx:154-183` measures stable untransformed wrappers and anchors before applying transforms. `209-220` remeasures after viewport resize and size changes to the outer container, document body, initial section wrappers, and initial anchors. This covers body growth from a banner before the journey and wrapper growth from streamed section content. The wrapper itself is not translated (`experience.module.css:314-318`), while its inner content is (`352-354`).
- [x] Sampling and reverse traversal: `full-page-motion.ts:26-50` selects neighboring anchors from their measured document coordinates, clamps interpolation, and recomputes progress and placement from the current native scroll position. Before the first and after the last anchor it uses the appropriate endpoint; an empty anchor list gives transparent output. `scroll-experience.tsx:171` sorts measured anchors by vertical position.
- [x] Viewport placement contract: `full-page-motion.ts:45-47` expresses horizontal placement relative to viewport width and vertical placement relative to current scroll. `experience-scene.tsx:188-213` consumes that placement in the orthographic view offset and zoom. Placement applies directly every invalidated frame and is not subject to the progress convergence threshold.
- [x] Reduced-motion and cleanup: `scroll-experience.tsx:201`, `227`, and `251-272` zero content travel, recreate measurements on preference change, remove pointer listeners, and reset the retained pointer. `299` unmounts the scene under reduced motion; `experience.module.css:703-712` disables the relevant content transforms. `221-225` removes scroll/resize subscriptions, disconnects observations, and cancels pending measurement RAF work.
- [x] Initial loading deadline respects active state: `scroll-experience.tsx:133-136` starts the timeout only while mounted, active, not reduced-motion, and loading, and clears it when those conditions change.
- [x] Candidate outside-journey canvas retention was checked against actual composition by the parent reviewer: every landing child, including closing content, is inside `ScrollExperience`; there is no scrollable trailing sibling and navigation unmounts the experience. Consequently, a jump wholly past the journey cannot reproduce the candidate in the current page, and it is not a finding.
- [ ] Browser reproduction of layout shifts, asynchronous font/content changes that alter position without changing any observed box size, resize/orientation, media preference toggles, and canvas alignment. No browser tests were run by this scout.
- [ ] Keyboard behavior of chapter navigation: the parent reviewer identified and escalated focus retention after `scrollIntoView`; this scout does not mark that issue resolved.

### Summary and score

No new confirmed source defect beyond the parent-owned keyboard issue. The documented code paths support normal-flow scrolling, cached position measurement with size-based invalidation, and reduced-motion cleanup. Actual rendering and late-content behavior still require the runtime verifier's evidence. Score: N/A for this bounded exploratory check.

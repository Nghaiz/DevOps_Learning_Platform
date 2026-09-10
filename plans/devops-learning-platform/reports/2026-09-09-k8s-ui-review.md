# K8s Game UI Review

**Current outcome:** the latest user correction restores the original session-start wire shape through `writeCurve`. The bundled-route and replacement-arch designs below are historical and superseded; see the final correction section for current acceptance.
Final code review. Implementation fixes were made by the parent; this reviewer changed only this report.

## Scope

Current K8s routing, edge animation, resource identity and event UI changes only. The working tree also contains earlier unrelated modifications; this review does not attribute those changes to the present task.

## Completed checks

- Dashed batches do not enter the marker loop; dash offset advances toward increasing path distance.
- Marker sizing is fixed in screen pixels and accounts for renderer pixel ratio.
- Runtime route arrays and ownership arrays retain the same fixed segment stride, including selected-link overlays.
- Event history clearly separates historical error entries from currently open incidents; search and severity filters share the same presentation for resource and cluster events.
- Missing incident targets render a non-interactive deleted-resource state.
- Resource identity tables cover every `ResourceKind`; icons provide a second identifier independent of color. Changed PVC/ResourceQuota geometry remains inside the existing factory/disposal path.
- Revised runtime cache translates fixed route segments during drag/transitions and replans on release/settling. The added spy regression test checks planner call count and endpoint displacement.

## Performance investigation

The first runtime version recomputed all routing candidates every movement frame. This concern was relayed and the parent replaced that path with cached route deformation. Initial 30/100-link wall-clock measurements were collected under severe host contention and are not reliable performance evidence; the 200-link run was cancelled. No FPS or stable-runtime performance claim is made.

## Critical (must fix)

None found in the reviewed changes.

## Important (fix before merge)

No unresolved findings in the inspected code. Two concerns were addressed during review:

1. `scene/scene-runtime.ts:284` — Full candidate routing ran every frame while resources moved. The current implementation deforms cached routes during motion and replans on release/settling; planner-call-count and endpoint-displacement regression coverage was added.
2. `shared/bundled-routing.ts:189` — Uniform 32-segment sampling could skip short gathering stems on long routes, yielding diagonal endpoint segments despite identical final socket coordinates. The current sampler reserves two segments at each endpoint and fixes their height to the corresponding socket. Shared-stem regression coverage was added.

## Minor / Suggestions

- `shared/bundled-routing.test.ts` — The obstacle test currently checks sampled vertices. A future geometric regression should check the complete rendered segments against resource footprints, since clear vertices alone do not prove clear chords.
- Re-measure full route planning on an unloaded host before making dense-graph performance claims. Cached motion removes repeated graph searches, but full planning remains a synchronous operation.

## Independent edge-case scouting

Completed by the Explore agent `edge_scout`. The agent executed the actual patched routing module against the existing 30-pod fixture: all 30 final segments were cardinal (`diagonalCount = 0`), with representative final segments from `(-0.1, 0.64)` to `(-0.1, 0.44)`. This is post-fix evidence; the source read occurred after the fix. The scout found no further concrete cache/end-anchor defect.

## Validation and limits

- Static tracing covered missing endpoints, coincident resources, broken/healthy socket separation, edge ownership/segment stride, selection overlays, motion caching, removed incident targets, history bounds, filters and empty states.
- Independent execution checked the patched 30-link gathering case.
- Final results attributed to the test owner: latest full app/e2e typecheck passed; scoped ESLint on the four cache/routing files passed; latest runtime/routing regression tests passed **7/7**. The shared-stem assertion compares coordinates numerically to tolerate floating-point interpolation differences.
- The full K8s suite reported **154 passes and one timeout** in the dense 312-resource layout test (15-second limit). The isolated rerun also timed out on the overloaded host, without an assertion failure. This test remains unresolved; the full suite is not claimed green.
- Browser validation attributed to the parent on the current dev build (port 3002): new routes/shared trunks, larger dots and changed palette/icons were visible in `output/playwright/k8s-routes-new.png`; desktop events in `k8s-events-new.png`; search empty state and a fitting 390×844 mobile panel in `k8s-events-mobile.png`. No additional scene errors were observed. The dev console still showed pre-existing CSP eval/Toaster `getServerSnapshot` messages and Three.js deprecations. Earlier stale-build screenshots are excluded as evidence.
- Arbitrary rendered-segment/obstacle intersections, intermediate animation geometry and stable-host performance were not exhaustively checked.
- No `.Codex/t1k-activation-*.json`, domain reviewer files or `docs/code-standards.md` were present. Relevant app instructions and the `t1k:review` workflow were read. No security-sensitive boundaries or dependency changes were introduced in this scope.

## Documentation

No concrete stale routing/animation claims were found in `docs/games` or the current `p14-arena` plan. No additional documentation update is required for this UI change.

## Summary

No blocking code findings remain after the routing cache and explicit stem fixes. Latest focused checks and the parent's current-build visual checks passed; the dense-layout timeout remains unresolved.

## Score: 8/10

The implementation addresses the requested behavior and has targeted regression coverage and current-build visual verification. The remaining limits are geometric stress coverage and reliable dense-graph performance measurement.

## Correction review — vivid colors, restored icons and raised arches

Scoped to `resource-identity.ts`, `resource-icon.tsx` and `bundled-routing.ts` in the correction turn; adjacent routing assertions were inspected for consistency. No additional production files were reviewed or edited.

### Critical / Important

No blocking findings in these corrections.

- All 26 palette entries now use saturation 79–92% and lightness 52–62%; the previous pastel/neutral entries are removed. The shared HUD/scene color derivation is unchanged.
- Verified the six requested mappings directly against `git HEAD`: ReplicaSet → `Layers3`, StatefulSet → `LibraryBig`, DaemonSet → `Orbit`, CronJob → `AlarmClock`, HorizontalPodAutoscaler → `Scaling`, ServiceAccount → `ContactRound`.
- Healthy and broken links share the raised-arch formula `min(3.2, 0.65 + sqrt(total) * 0.5)`. Endpoint stems keep their fixed socket height and reserved samples; only interior bends receive the larger rounding radius.
- The new test requires both healthy and broken spans to rise more than 1.5 units above equal-height endpoints. Existing finite-coordinate, obstacle, moved-endpoint and shared-tail expectations remain applicable.

### Validation and score

Static correction review passed. The parent owns the correction-turn test run and visual screenshot; earlier checks do not establish that this latest correction passed. No duplicate broad tests or new scout agents were started. **Correction score: 8/10**, subject to the existing dense-graph verification limits above.

## Superseding correction — restore the original wire rendering

The user's latest instruction supersedes the bundled-route and raised-corridor designs documented above. The unused `bundled-routing.ts` implementation and its tests were removed by the parent. Earlier gathering-stem checks and proposed corridor geometry are no longer acceptance criteria for the current implementation.

### Baseline and static verification

The restoration baseline is the **working tree at the start of this task**, which already contained uncommitted changes. It is not `git HEAD`. The parent captured the original call using `start = { ...a, y: a.y + a.size * 0.3 }`, the equivalent `end` for `b`, and `writeCurve(target, start, end, link.fan)`. The current runtime invokes that same existing function with those same endpoint adjustments and fan value. A comparison against HEAD's unadjusted endpoints was rejected because HEAD predates the user's existing changes.

- The original `shared/edge-routing.ts` curve function was not changed in this correction. The runtime retains its route cache around the restored curve calculation.
- Stroke widths remain 2.7 pixels for solid links and 3.0 pixels for broken links.
- Dots remain 14 screen pixels and are emitted only for solid links. Broken links retain their moving dash pattern.
- The saturated palette and the six explicitly restored icon mappings remain in place.

### Current checks and summary

Results attributed to the parent for this restoration: original edge-routing/runtime tests **8/8 passed**, `tsc --noEmit` passed, and scoped ESLint passed. No additional test runs were started by this reviewer.

No blocking findings remain in this bounded static restoration review. Previous screenshots and bundled-route tests describe superseded wire geometry; they are not proof of the latest wire rendering. **Current correction score: 8/10.**

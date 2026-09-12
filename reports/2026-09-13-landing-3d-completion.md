# Landing 3D scroll — completion record

Status: **VERIFIED AND READY FOR LOCAL COMMIT.** 2026-09-13. The independently reviewed natural-flow source passes a coherent **20/20** production browser run, with zero failures, skips or retries on build `I7eYNXwmu3q9KzrnjDpAr`. All five finalization artifacts pass validation with zero errors or warnings. The local commit remains with the lead; no production deployment is claimed.

## Delivered behavior

The page now scrolls naturally through four narrative chapters and five anchors in the lower content. One transparent GPU canvas moves large colorful workstation, container and cluster models between alternating page positions. Assembly, camera orbit and incident/recovery routing follow scroll position in both directions. HTML sections move normally; there is no pinned theater or hidden chapter swap.

The terminal is a colorful workbench with scroll-linked pipeline progress and finite result effects. Scrolling changes its presentation without executing a command. Explicit Run, Reset and topic controls retain their behavior, and the copy identifies illustrated commands and cluster states as demonstrations. Existing catalog data, curriculum links and account CTAs remain integrated.

React Three Fiber and Three.js load lazily inside the client boundary. Measured page anchors feed progress/placement references and an explicit invalidation bridge; demand rendering settles and sleeps. Reduced motion uses readable static schematics without GPU rendering. Unavailable WebGL, lost context and failed renderer loading preserve HTML content, controls and fallback. Native scrolling and keyboard focus remain available.

The scope includes landing presentation, required copy/tokens, focused tests, design documentation and the bounded HTTP loopback policy correction below. Auth, APIs, persistence, published content and K8s Arena behavior are unchanged. No production deployment is claimed.

## Final-source verification

| Check | Result |
|---|---|
| Fresh production build | PASS — `I7eYNXwmu3q9KzrnjDpAr` |
| Focused marketing/security/proxy tests | 60/60 pass in seven test files |
| Fresh copy package rerun | 63/63 pass in four test files |
| Web lint | PASS — no errors |
| Standalone app and E2E typecheck | PASS after final build |
| Token gate | PASS — 567 files, four explicit exemptions |
| Antipattern gate | PASS — 612 files, four exact Arena exceptions |
| Fresh bundle gate | PASS — shared 1,050,883 B / unchanged 1,150,000 B ceiling |
| Terminal bundle isolation | PASS — xterm on 4/4 terminal routes, absent from 33 other routes |
| Independent natural-flow source review | PASS — 9/10; no unresolved Critical or Important source finding; focus and loopback policy fixes re-reviewed |
| Full production browser acceptance | 20/20 PASS in 144.9 seconds — zero failures, skips or retries on the final build |
| Finalization artifact gate | PASS — direct validator at stage `finalize`; five artifacts, zero errors and warnings |

Final build/test/lint/bundle logs are `2026-09-13-landing-3d-{build,tests,lint,bundle}-final.log` in this directory. Earlier palette regression, copy and pinned-layout results remain historical unless explicitly included in the final focused run. The current source review is [recorded separately](2026-09-13-landing-3d-review.md).

## Coherent final-run measurements

The final performance case passed on **ANGLE Direct3D11, NVIDIA GeForce RTX 4060 Laptop GPU**. It recorded **180 RAF samples and 181 WebGL draw frames**: median **4.2 ms**, p95 **12.5 ms** against a 32 ms target, maximum **33.4 ms**, and **zero observed long tasks**. DOM LCP was **216 ms** with a `SPAN` candidate. This is a measured local desktop result; it does not establish universal GPU/mobile smoothness.

Actual resource observations include **16 JS chunks, 679,373 encoded body bytes, 2,438,813 decoded body bytes and 684,173 transfer bytes**, including lazy Three/R3F chunks. Encoded/decoded bodies are distinct from transfer including overhead and from the entry manifest, which does not include every lazy chunk. The home manifest entry is not the page's total downloaded JavaScript.

The isolated hardware probe's 8.4 ms p95 and the incomplete run's 20.8 ms p95 are not the final sample. The superseded pinned implementation's SwiftShader p95 of 150.1 ms remains a failed software-renderer target. DOM LCP cannot stand in for canvas rendering time.

## Actual browser acceptance

The final suite verifies four chapter states and forward/reverse model travel, lower-page anchor transitions, incident/recovery, colorful terminal progress without implicit execution, actual explicit Run/Reset behavior, keyboard focus, native wheel and touch, responsive layouts and both themes. Reduced motion, denied WebGL, actual context loss and a failed renderer chunk retain usable fallback. Demand rendering sleeps and wakes in the initial and lower-page compositions.

Native wheel moved the page from 0 to 480 px while the hero heading moved from y=246.9 to -249.1 px, proving content is not pinned. Native touch moved both the positive control and the app by 425 px. Idle draw counts stayed 220→220 initially and 369→369 lower down, then increased after new input.

Six axe scans reported **zero violations**; all six retained **color-contrast incomplete** checks. This does not establish comprehensive contrast/WCAG certification, and desktop device emulation does not establish real mobile-GPU performance. The runtime report records console/CSP observations and the failure-injection scope.

## Defects closed during verification

- The initial production palette parser rejected valid hex colors emitted by CSS minification. The corrected parser supports bounded RGB and 3/6-digit hex, rejects unsupported values and has 16 regression cases, including compiled palette values. The original fallback-only failure remains in runtime history.
- Natural-flow measuring anchors initially extended document width; their final boxes stay within the page. Cached geometry now observes body and stable section-size changes to handle late shell/content layout. Independent review accepted both corrections.
- Explicit chapter navigation now focuses its destination section with `preventScroll` before moving there. Sections use `tabIndex={-1}`; passive scrolling does not steal focus. A browser regression checks the next Tab reaches the destination's incident control.
- Guest curriculum redirects on the required local HTTP base were upgraded to unsupported HTTPS by production CSP. Only exact HTTP loopback request URLs (`localhost`, `127.0.0.1`, `[::1]`) now omit `upgrade-insecure-requests`. HTTPS loopback, LAN/external hosts, missing URLs and spoofed forwarded headers retain the upgrade. HSTS, nonce/strict-dynamic script policy, object/frame restrictions and other security controls are unchanged. Ten proxy origin/header regression cases are part of the final 60-test run; the reviewer accepted the bounded change.
- The first full natural-flow run was 19 passed / 1 failed when CDP's synthetic scroll gesture produced no page movement. The same command failed on a plain 3,000 px HTML positive control, while native touch start/move/end dispatch moved it 425 px. The maintained case now proves that control before checking the actual landing; its focused run and the coherent 20-case rerun pass on unchanged production source. The original failure remains recorded as a harness defect.

## Evidence and remaining closure

- [Accepted full-page plan and tracking](../plans/reports/2026-09-13-landing-3d-scroll.md)
- [Independent source review](2026-09-13-landing-3d-review.md)
- [Browser acceptance, historical failures and measurement limits](2026-09-13-landing-3d-runtime.md)
- [Artifact gate directory](harness/2026-09-13-landing-3d/)
- [Desktop WebGL screenshot](../apps/web/e2e/.artifacts/landing-final-desktop.png), [mobile screenshot](../apps/web/e2e/.artifacts/landing-final-mobile.png), [colorful terminal screenshot](../apps/web/e2e/.artifacts/landing-final-terminal.png)

Functional/runtime verification, design documentation and artifact validation are complete. The local commit is ready for the lead's git lane; the task's commit records this work without embedding a self-referential hash here. Raw screenshots, measurements and results are retained locally under `apps/web/e2e/.artifacts/landing-3d-runs/final-20-pass/`; optional walkthrough video and environment cleanup receipts belong to the runtime report. The earlier 17 passing pinned-layout cases remain historical and are not substituted for the final natural-flow run. Historical P16 reports remain unchanged.

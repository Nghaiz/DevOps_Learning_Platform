# Landing 3D natural flow — final browser acceptance

**PASS: 20/20 acceptance tests, 0 failed, 0 skipped, 0 retries; 144.9 seconds.**
Date: 2026-09-13. Production build: `I7eYNXwmu3q9KzrnjDpAr`.

The final design uses normal document flow, four visible chapters and one canvas
whose models travel through the page. The rejected pinned version is historical.

## Execution

Guest-only full Chromium, one worker, Windows ANGLE Direct3D11. The config starts a
fresh production server, never reuses one, and creates no authenticated account.
The default E2E profile excludes `landing-3d.spec.ts` because its headless shell
may use software rendering; `landing.config.ts` explicitly includes it and keeps
the real-GPU/frame-budget assertions. Existing `landing-visual.spec.ts` remains
in both profiles. This isolates the hardware prerequisite without relaxing it.
Post-run discovery confirms 191 default cases (four existing landing visual cases,
no hardware-only cases) and all 20 dedicated cases. The existing public Three
isolation check now targets `/login`, since the requested landing intentionally
loads Three. The matching game-positive check first enters a real level from the
chooser, then waits for the unchanged scene channel and scans actual JS markers.
Both boundary cases pass (2/2, 12.0 seconds) on this same build, using the explicit
local variables and a guest config at `.artifacts/landing-boundary.config.ts`.

> **Correction, 2026-09-13.** That config path is untracked: `apps/web/e2e/.gitignore`
> excludes `.artifacts/`, so nobody could reproduce this result from a clean checkout.
> The two cases themselves are in `games.spec.ts` and run in the DEFAULT profile, so
> the evidence is real; only the cited command was unreproducible. Reproduce with
> `pnpm --filter @devops-platform/web e2e:bundle-boundary` (added the same day), which
> selects the same cases by name from the tracked config.
The initial positive probe timed out on the level chooser before that harness
correction; it was not a rendered-scene pass. Authenticated isolation checks remain.
Every application browser invocation explicitly used the following variables:

```powershell
$env:E2E_START_SERVER='1'
$env:E2E_BASE_URL='http://localhost:3000'
$env:E2E_ORIGIN='http://localhost:3000'
pnpm exec playwright test -c e2e/landing.config.ts
```

Run from `apps/web`. E2E TypeScript, scoped ESLint and formatting also passed.

| Verified behavior | Cases |
|---|---:|
| Four chapters, fault/recovery, desktop/mobile, both themes | 4 |
| Native wheel, PageDown, reversal and destination keyboard focus | 1 |
| Reduced motion, unavailable WebGL, actual context loss | 3 |
| Hardware frame/LCP measurement | 1 |
| Controls at 320×568 and 768×600 | 2 |
| Idle sleep and wake through lower sections | 1 |
| Failed lazy renderer chunk | 1 |
| Lower sections, terminal scroll and explicit execution | 1 |
| Native mobile touch with positive driver control | 1 |
| Actual guest curriculum navigation to local login | 1 |
| Existing terminal examples, reset and theme changes | 4 |

Native wheel moved scrollY 0→480 and the first heading Y=246.9→−249.1, proving
content moves rather than remaining pinned. Enter on chapter 3 focuses its
section; the next Tab reaches the fault button. Native touch moved the positive
control 425 px and the real landing 0→425 px.

Lower-section model destinations alternate normalized X 0.85→0.15→0.90→0.10→0.85;
GPU draws and screenshots were captured at each. Terminal scroll changes visual
progress without running a command; only **Chạy ví dụ** produces output. Idle draws
remain 220→220 and lower-page idle draws 369→369; section changes wake rendering.

## Final measured performance

Actual renderer: **NVIDIA GeForce RTX 4060 Laptop GPU, ANGLE Direct3D11**. Hardware
rendering and p95 ≤32 ms are assertions. Video recording was disabled for this sample.

| Measurement | Result |
|---|---:|
| RAF samples / observed WebGL draw frames | 180 / 181 |
| RAF median / p95 / maximum | 4.2 / **12.5** / 33.4 ms |
| p95 target | 32 ms — PASS |
| Observed long tasks | 0 |
| DOM LCP | 216 ms (`span`) |
| Observed JS resources during traversal | 16 |
| Encoded / decoded JS bodies | 679,373 / 2,438,813 bytes |
| Transfer including overhead | 684,173 bytes |

LCP measures DOM, not canvas. GPU draws and visual captures are separate evidence.
JS totals include dynamic Three.js/R3F and traversal resources; they are not the
initial-entry-only bundle measurement. The root agent owns the separate bundle gate.

## Accessibility, visuals and artifacts

Six axe scans reported **zero violations**, with `color-contrast` incomplete in all
six. This is not full contrast/WCAG certification. Ordinary visual/lower-page cases
reported zero unexpected page/console errors and zero CSP violations. Forced GPU
and chunk failures are deliberate negative-path checks.

The root agent inspected actual desktop hero, Docker transformation, operations,
lower sections, colorful terminal and 390 px mobile images. These show ready WebGL;
reduced-motion and GPU-failure captures separately verify readable fallbacks.

Full final evidence: `apps/web/e2e/.artifacts/landing-3d-runs/final-20-pass/`, including
`results.json`, screenshots and individual frame/axe/scroll JSON files. Friendly files
under `apps/web/e2e/.artifacts/` are:

- `landing-final-desktop.png`, `landing-final-docker.png`, `landing-final-observe.png`
- `landing-final-mobile.png`, `landing-final-terminal.png`
- `landing-final-walk.webm`

The separate page walk passed **1/1**, 27.6 seconds, using the same explicit variables
and `-c e2e/landing-video.config.ts`. It records native wheel travel, fault/recovery
and explicit terminal execution. WebM: VP8, 1440×1000, 25 fps, 20.76 seconds,
3,171,915 bytes. Encoding fps is not the GPU measurement. Archive: `final-walk-video/`.

## Resolved failures and limits

Historical archives beneath `.artifacts/landing-3d-runs/` preserve these findings:

- `first-failed-palette/`: production minification converted RGB tokens to hex;
  the RGB-only adapter was fixed and regression-tested.
- `superseded-pinned-17-pass/`: rejected layout; software SwiftShader p95 150.1 ms
  failed the target. It remains a separate historical result, never relabeled as GPU.
- `natural-first-ssl/`: local HTTP prefetch redirects upgraded to HTTPS. A precise
  loopback CSP fix preserves production HTTPS policy; actual link navigation now passes.
- `final-first-touch-driver/`: 19/20 passed; synthetic gesture also failed on plain
  tall HTML. Native touch packets passed that control and the app. The subsequent
  coherent 20-case run is the final result; `touch-native-driver/` retains the control.

Playwright stopped its servers and **ports 3000/3001 were verified free** before the
root started the persistent preview. No account, sandbox, cluster resource or
server-side authenticated session was created. Maintained tests and this report
are frozen; no further browser-server runs are needed.

These are local RTX 4060 measurements. Mobile emulation does not measure a physical
phone GPU. Field performance, production deployment and full WCAG certification
are not claimed. Browser coverage percentage was not collected; unit/build/source
review results are reported separately by the root agent.

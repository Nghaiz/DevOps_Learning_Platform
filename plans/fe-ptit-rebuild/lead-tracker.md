# Lead tracker (session 00), feat/fe-ptit-rebuild

Updated 2026-10-03 ~08:20. Source of truth for what the lead still owes.

## Lanes
| Lane | State |
|---|---|
| ui, L1..L7, L3b, F1 (review-1, 29/29), S1+S2 (server), T1 (dead CSS/tokens), E1 (@flow specs) | done |
| G: game stats/achievements + save warning UI (phase-14-exec §8.3/§8.6) | running in worktree D:/NCKH/dlp-fe-g, branch feat/fe-game-stats; lands as a follow-up PR |

## Agreed with peers (2026-10-03)
- 0c: PR #161 (feat/labs-rebuild: per-session cookie, Session.hard_cap_at, Theia sandbox image labs-b2, two rewritten lessons) merges to main FIRST. Then we merge main into this branch, open our PR, CI green, merge. 5a does the same for the landing.
- ONE deploy from main after all three merge (CI images sha-<main>, migrator before web for migration 0018). 0c runs it. No separate deploys.
- Exam: no examId = practice (dfb54559); scoring window [started_at, least(submitted_at, deadline)] (0b0d080e). 0c keeps "record submission into attempt" (needs a migration) on its list.

## Gates (local, mirror CI ts job)
- [x] env-check · lint/typecheck/build 24/24 · tokens:check · gitleaks (140 commits, clean)
- [x] bundle:check: was 945,119 B shared > 900,000; fixed by packages/ui sideEffects:false (5309adb1) -> 569,836 B
- [ ] turbo test (running) · [ ] terminal browser tests · [ ] e2e:ci local (E2E_START_SERVER=1, localhost:3000)
- [ ] screenshots 1440/390 x light/dark on next start, incl. catalog search-tabs CSS after sideEffects change

## Lead TODO
- [ ] After #161 merges: merge main into this branch, resolve terminal/DTO conflicts, re-run gates, open PR, CI green, merge.
- [ ] docs: design-system.md / design-guidelines.md / frontend-practice-redesign.md still describe the old FE (docs pass).
- [ ] After deploy: run @flow lab/lesson/playground on the cluster (E1 ported them; lab pinned to dlp-linux-triage, lesson to dlp-ide-config-edit; IDE check uses #theia-app-shell).
- [ ] Known gaps for the final report: players can't reattach to an existing session (only /session/<id>/terminal); chaos mode lives in the frozen k8s arena.
- [ ] Tell user: stray empty folder C:/c/Users/... from an early screenshot path bug (deleting it was blocked).

## Done (lead, this session)
ConfirmDialog/WithNums -> kit · Split sticky var · readCatalogCounts -> catalog · keyboard spec · no-commerce fix · k8s arena identical to main · lesson title de-dup · EmptyState square glyph · scene panels squared + dead copy keys · /me session titles + lesson titles · /problems game filter · exam sitting problems[] + solved · 'Sân chơi' wording · ui typecheck fixes · bundle fix.

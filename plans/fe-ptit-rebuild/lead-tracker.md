# Lead tracker (session 00), feat/fe-ptit-rebuild

Updated 2026-10-03. Source of truth for what the lead still owes.

## Lanes
| Lane | Area | State |
|---|---|---|
| ui, L1..L7 | all page lanes | done |
| L3b | games copy migration (CI/CD HUD, scenes) | resumed after turn cap (commits 2fd46c76, 176c3346) |
| F1 | review-1 fixes (reports/review-1.md) | resumed after turn cap (90a72394, 9ab4c465; error-state + admin-page in flight) |
| S1 | server: problems.list gameId (39c9a309), examSitting problems[], submit exam context, me.activeSessions content, me.listProgress lessonTitle | resumed after turn cap |
| T1 | dead CSS + 39 unread tokens (practice.css, globals.css, tokens contract, docs/design-system.md) | running |

## Peer sessions
- 5a: landing `/` (app/page.tsx, components/marketing -> landing, e2e/landing-*, home.* copy). Merges independently; re-adds landing-visual.spec.ts to e2e:ci. Shared GSAP/CSS traps (none apply: no element mixes framer-motion and CSS keyframes, checked).
- 0c: session ended. Its 3 promised server items are S1's job now.

## Lead TODO
- [ ] After S1: /problems game switch sends filter.gameId; exam sitting reads problems[] (solved state); /me resume links + lesson titles.
- [ ] After F1: move components/admin/with-nums.tsx into kit, repoint me-client, learning-now, admin.
- [ ] After all lanes: delete dead copy keys (dead-key test lists them: common.action.next/open, author.issues.row, ...).
- [ ] games-hub.spec.ts green twice locally (already in e2e:ci). e2e/games.spec.ts + games-git.spec.ts were broken before: fix or retire with reason.
- [ ] docs/: design-system.md and any FE docs describing the old sidebar/practice shell need the new system (docs pass at the end).
- [ ] Full gates after the final commit: turbo lint/typecheck/build/test (--concurrency 4 --continue), tokens:check, bundle:check, env-check, check-no-commerce, gitleaks, e2e:ci locally (E2E_START_SERVER=1, localhost origin).
- [ ] Screenshots of every route 1440/390 x light/dark; fix defects.
- [ ] PR + CI + merge; deploy web + migrator images to the VM, helm upgrade with all per-component tags, smoke https://dlp.192.168.94.130.sslip.io:30443.
- [ ] Tell user: stray empty folder C:/c/Users/... from a mis-resolved screenshot path (deleting it was blocked).

## Done (lead)
ConfirmDialog -> kit (41ae9306) · Split sticky var (c08e7186) · readCatalogCounts -> catalog (2608cd83) · keyboard spec (2608cd83) · no-commerce fix (785c2340) · k8s arena identical to main (screenshots) · lesson title de-dup + plain code label (b9e407ff) · EmptyState square station glyph (a908dfe2) · interim `/` redirect to /games (5a approved).

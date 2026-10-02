# Lead tracker (session 00), feat/fe-ptit-rebuild

Updated 2026-10-03 06:40. Source of truth for what the lead still owes after the lanes.

## Lanes
| Lane | Area | State |
|---|---|---|
| ui | packages/ui primitives | done (a20c865b…7d98772f) |
| L1 | catalog: lessons/labs/playgrounds lists, paths, quiz | done (fa8168cb) |
| L2 | workspace: lesson/lab/playground players, terminal/IDE | running |
| L3 | games: hub, k8s picker, git, cicd chrome | running |
| L4 | judge: problems, exams | done (09d09533) |
| L5 | studio: author lists/editors, git builder | done except problem-editor sub-lane (running) |
| L6 | admin | done (aa62c6c3) |
| L7 | account: auth, /me, /settings | running |

## Peer sessions
- 5a: landing `/` (owns app/page.tsx, components/marketing → components/landing, e2e/landing-*, home.* copy, Dockerfile public/ COPY). Merges independently.
- 0c: content, packages/{scenario,terminal,shared-types}, server/**, services, images. Session ENDED ~06:38. Cherry-picked: DTO change (109025ac..690a4022) and terminal fixes (…6ae75c59).
  Promised but not landed: problems.list `gameId?`, examSitting.get `problems[{code,title,gameId,solved}]`, server-inferred exam context on problems.submit. If 0c never returns: implement in server/** ourselves before merge.

## Lead TODO (integration)
- [ ] Move components/admin/confirm-dialog.tsx → components/kit (studio + admin import it); update imports + copy-gate anchors.
- [ ] Maybe move components/admin/with-nums.tsx → kit if a second lane needs it.
- [ ] kit `Split`: sticky offset prop (studio mode bar overlaps at lg:top-24).
- [ ] kit `RouteLine`: render slot for station rows (paths/[id] composes its own today).
- [ ] L1 pages import readCatalogCounts from components/marketing/catalog-stats.server.ts, which 5a deletes → move into components/catalog before merge.
- [ ] e2e/keyboard.spec.ts PRIMARY_NAV labels ('Playground'→'Sân chơi', 'Quiz'→'Trắc nghiệm'), skip-link and nav names.
- [ ] e2e:ci: add games-hub.spec.ts (L3) once green.
- [ ] Dead copy keys after all lanes: common.action.next/open (mine), session.* (L2), author.problem.* (L5 sub-lane).
- [ ] Delete apps/web/src/app/practice.css once nothing uses practice-* classes (grep), and its import in layout.tsx.
- [ ] Delete components/practice/games-hub.tsx if L3 left it.
- [ ] arena look: verify k8s arena screenshots vs main (Badge/Tabs/Switch/Button/Input/Dialog class changes leak; tokens frozen).
- [ ] Full gates: turbo lint/typecheck/build/test (--concurrency 4 --continue), tokens:check, bundle:check, env-check, e2e:ci locally, gitleaks.
- [ ] Screenshots of every route 1440/390 × light/dark, fix visual defects.
- [ ] PR + CI + merge; deploy web (+migrator) image to the VM cluster, smoke on https://dlp.192.168.94.130.sslip.io:30443.
- [ ] Tell user: stray empty folder C:\c\Users\… left by a mis-resolved screenshot path (blocked from deleting it myself).
- [x] ConfirmDialog → kit (41ae9306); Split sticky var (c08e7186); readCatalogCounts → catalog (2608cd83); keyboard spec (2608cd83); no-commerce fix (785c2340); k8s arena verified identical to main (screenshots).
- [ ] L3 done (e900f329). L3b (games copy migration, ~260 CI/CD strings) running.
- [ ] games-hub.spec.ts: run green twice locally, then add to e2e:ci.
- [ ] With 5a: `/` still renders old GamesHub on this branch; asked 5a for ETA / permission for interim redirect. Delete components/practice/games-hub.tsx + catalog.empty.games.title/body + catalog.games.soon together.
- [ ] e2e/games.spec.ts + games-git.spec.ts were already broken before (not in e2e:ci): fix or retire with reason.
- [ ] EmptyState default glyph is the round arc motif; consider a square station glyph.
- [ ] 0c's 3 server items not on feat/labs-rebuild: implement ourselves if 0c doesn't return.

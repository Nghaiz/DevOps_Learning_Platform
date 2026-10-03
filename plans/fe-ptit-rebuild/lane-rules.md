# Lane rules (every page lane reads this before touching code)

Work context: git worktree `D:/NCKH/dlp-fe`, branch `feat/fe-ptit-rebuild`. Several lanes and the
lead edit this SAME tree at the same time. Reports go to `plans/fe-ptit-rebuild/reports/`.

## 1. Inputs (read in this order)
1. `plans/fe-ptit-rebuild/design-brief.md`: the visual language and hard rules. Non-negotiable.
2. `plans/fe-ptit-rebuild/contracts/ui-kit.md`: token classes, packages/ui primitives, app kit.
   Primitives are being restyled by the ui lane and the kit (`apps/web/src/components/kit/*`,
   `components/shell/*`, `lib/topic-line.ts`) is being built by the lead right now. Code against
   the contract names; if an import does not exist yet when you typecheck, wait for it (re-check
   every ~10 min with `git log --oneline -5`), do not create your own copy.
3. Craft references (states, spacing, interaction details), optional:
   `C:/Users/Nghaiz/AppData/Local/Temp/claude/d--NCKH-DevOps-Learning-Platform/54103f7a-b360-4d73-9871-5bf3af897ffd/scratchpad/evondevKit/skills/ui-ux/references/`
   (`layouts/app.md`, `layouts/form.md`, `layouts/overlay.md`, `components/*.md`, `rules-type.md` for
   Vietnamese copy). Where it says rounded corners, single accent or sidebar, OUR brief wins.

## 2. Ownership
Edit ONLY the files your prompt lists. Anything else (shared registries, globals.css, nav, other
lanes' copy surfaces, packages/ui, e2e/routes.ts, apps/web/package.json, dead-key exceptions) →
send the lead a precise request in your report instead. Never edit `components/k8s-arena/**`.

## 3. Rebuild, don't patch
"Đập đi xây lại": rewrite the page markup from scratch on the kit + primitives. Keep every
FEATURE and every data call (tRPC procedures, hooks, server props) working: the rebuild must not
lose behavior. Fix the bugs listed in your prompt while you are there. Delete files your rewrite
orphans (grep for importers first), and delete their copy keys.

## 4. Copy
All visible strings go through `t('…')` from `@devops-platform/copy` (lane copy-gates forbid
Vietnamese literals in TSX). Rewrite every key you own in the voice of design-brief §8. Delete keys
nothing calls (`packages/copy/src/dead-key.test.ts`). Copy rules enforced by
`packages/copy/src/copy.contract.test.ts`: no em/en dash anywhere in copy files (comments too), full
diacritics, NFC, no banned phrases, groups of exactly three sibling keys need a dated reason.

## 5. Tests
- Logic and security tests must keep passing unchanged. If one fails, your change broke behavior: fix the code.
- Presentation tests for your files (DOM queries by label, class pins, copy-gate anchors) are yours to
  update to the new markup. Keep the invariant they protect (labels exist, roles, one `<main>` only in
  app-shell, terminal never remounted, etc.). Never delete a test to get green; rewrite it.
- E2E specs that cover your routes: update selectors/names in the same commit when you rename UI.

## 6. Verify (each as its own command, from `D:/NCKH/dlp-fe`; never chain with `&&` inside pnpm filters)
```
pnpm --filter @devops-platform/web exec tsc --noEmit
pnpm --filter @devops-platform/web exec eslint <your changed files>
pnpm --filter @devops-platform/web exec vitest run <your test paths>
pnpm --filter @devops-platform/copy exec vitest run
pnpm tokens:check
```
tsc sees the whole tree, including other lanes' work in progress: only errors in YOUR files are yours.
Do NOT run `next build`, `next dev`, `pnpm turbo …`, or the full vitest suite: RAM is shared by 8
agents. The lead builds, screenshots and integrates.

## 7. Git
- `git status --short` before every git command. Never `git add .`/`-A`, never `commit -a`, never
  checkout/switch/branch/stash/reset.
- New files: `git add <explicit paths>`; then `git commit -m "<msg>" -- <explicit paths>`.
- Commit every ~15 tool calls, prefix `feat(web): <lane> …`, message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Lock-file error → wait 5s, retry.
- Near your turn/context budget: commit everything, then write
  `plans/fe-ptit-rebuild/reports/<lane>.md` (done / not done / requests for lead) and commit it.

## 8. Final report (your last message)
Routes rebuilt, files added/deleted, behavior bugs fixed, tests changed (why), verify outputs
(pass counts), and REQUESTS FOR LEAD (exact file + change) for anything outside your ownership.

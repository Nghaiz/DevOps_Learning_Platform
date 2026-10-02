# Review 1 (admin, judge, packages/ui) — findings to fix

Source: adversarial review 2026-10-03, scope admin/**, app/(session)/**, packages/ui (not lesson/).
Hard rules (§0) passed. Fix everything below unless marked "skip".

## Critical
1. components/admin/exam-form.tsx:328-346 — "Tiếp" and submit are the same `<Button>` in the same JSX slot; React reuses the DOM node and flips `type` to submit during the click, so ONE click on "Tiếp" at step 2 submits (edit mode calls exams.update immediately; create mode shows a premature error). Fix: distinct elements with `key="next"` / `key="submit"` AND `event.preventDefault()` in Tiếp. Add a DOM test: clicking Tiếp at step 2 does not call onSubmit.

## Important
2. packages/ui/src/table.tsx:80-95 — `TableHead` header styling (`sticky top-0 bg-muted type-label whitespace-nowrap`) also hits `<TableHead scope="row">` (exam titles, student names, submission timestamps become uppercase mono, unwrappable). Fix: header styles only for `th` inside `thead` (style via `TableHeader` `[&_th]:…`, or a `scope`-aware variant); row headers render as normal cell text. Check callers: admin/exams/exams-client.tsx:222, admin/exams/[examId]/exam-detail-client.tsx:376, (session)/problems/[code]/problem-submissions.tsx:92. Update table.test.tsx.
3. Admin list error/empty branches (audit, users, sessions, classes, exams, class members): error replaces table AND pager; copy says press "Về đầu" which isn't rendered; at page>1 the user is stuck. Fix: when page > 1 render a "Về đầu" action in error and empty states.
4. admin/exams/[examId]/exam-detail-client.tsx:62-82 and admin/classes/[classId]/class-detail-client.tsx:69-89 — loading/error render no header/crumbs/h1 and copy promises a back link / reload that doesn't exist. Fix: render the page frame (ToolHeader with crumbs, h1) in loading/error, add a back link and a reload button, or reword copy to match existing controls.
5. (session)/exams/[examId]/exam-sitting-client.tsx:89-90, 294-348 — `refetch` callback depends on the `query` proxy (new each render) → the 30s resync interval is torn down every 250ms tick and never fires. Fix: depend on `query.refetch` or keep the callback in a ref. Add a test if feasible.
6. Contrast: text on its own 10–15% tint is < 4.5:1 — (session)/exams/exams-client.tsx:152, (session)/problems/[code]/problem-client.tsx:160, (session)/problems/[code]/verdict-chip.tsx:21 (text-success on bg-success/10 ≈4.0, text-warning on bg-warning/10 ≈4.1, CE bg-warning/15 lower). Fix: `text-foreground` + coloured icon/dot, or solid fill with its `-foreground` token.

## Minor (fix)
7. components/admin/class-picker.tsx:27-28,54-56 — own query key never invalidated by classes.list.invalidate(); invalidate it on class create (or key off the tRPC key).
8. components/admin/exam-form.tsx:122-129 — Enter at a middle step does nothing; handle Enter → next step in onKeyDown.
9. components/admin/exam-form-model.ts:132-139 — half-filled datetime-local "" → null ("open now"); use `validity.badInput` to report invalid.
10. admin/exams/exams-client.tsx:118-121 + components/admin/exam-form-sheet.tsx — confirm before closing a dirty form; clear the stale server error when the sheet opens.
11. components/kit/confirm-dialog.tsx:91-103 — block `onOpenChange(false)` (X, Esc, overlay) while confirming.
12. admin/exams/[examId]/exam-detail-client.tsx:195-201 — revokeObjectURL in setTimeout; attach anchor to DOM before click.
13. admin/audit/audit-client.tsx:102, admin/overview-client.tsx:266 — actor explanation only in `title`; show visible text or Tooltip on a focusable trigger.
14. components/admin/exam-state-badge.tsx — closed state uses legacy `secondary`; use `outline`.
15. (session)/exams/[examId]/exam-sitting-client.tsx:191-201 — every start error shown as "chưa mở hoặc đã đóng"; only for FORBIDDEN, else describeTrpcError.
16. (session)/problems/problems-toolbar.tsx:172-188 — asc/desc as two aria-pressed toggles; make a radiogroup (or one toggle).
17. (session)/problems/[code]/problem-hints.tsx:86-100 — cost shown twice; keep it in the button label only.
18. (session)/exams/[examId]/countdown-board.tsx:62-66 — per-digit key replays the reveal animation every second; animate only when minutes change (or drop the key).
19. (session)/problems/[code]/problem-submissions.tsx:49 — pass `retrying={submissions.isFetching}` to ErrorState.
20. Page-level `redirect('/login')` in (session) pages (exams/page.tsx:27, exams/[examId]/page.tsx:34, problems/page.tsx:25, problems/[code]/page.tsx:54) drops the return path: redirect to `/login?next=<path>`.
21. (session)/exams/[examId]/page.tsx — validate examId as UUID (`isUuid` from components/admin/route-params.ts or a shared lib) → notFound().
22. components/kit/board.tsx BoardRow — whole row is one link → very long accessible names; set `aria-labelledby` to the title element id (keep the row clickable).
23. packages/ui toast close button size-6 → size-8. line-marker "current" ring outline-signal is ~1.1:1 on paper → ink ring (or signal on an ink offset). card.tsx `accent` arc uses legacy difficulty tokens + round arc → retire `accent` if no caller (grep) or move to line tokens. separator.tsx Kbd comment says rounded-sm (fix comment). sheet.tsx right side enters with rise → slide from right.

## Copy (admin.ts, problem.ts problem.oj.*, exam.ts) — design-brief §8
24. Drop shouting caps for emphasis: admin.sessions.alert-title ("CÒN SỐNG"), admin.sessions.note-more ("KHÔNG"), admin.terminate.body ("BẠN"), admin.archive.body ("KHÔNG bị xoá"), admin.classes.remove-loss, admin.exams.scoreboard-description ("TRONG").
25. admin.users.note-more: drop the lecture → ", còn trang sau." · admin.content.empty-body-all: "nướng sẵn" → "Bài có sẵn trong image không nằm ở bảng này." · admin.users.empty-body: no English table name → "Chưa có ai đăng ký." · admin.audit.actor-unknown-note → "Dòng này thiếu người thực hiện do lỗi lúc ghi, không phải không ai làm."
26. Remove internal jargon from UI copy (BFF, gRPC, Postgres, cursor, sessions_audit, admin_terminated, "cờ seedable", "reaper chưa dọn", UTC): admin.error.* `.next`, admin.exams.strategy-note, admin.expiry.overdue, admin.audit.alert-body, admin.exams.form.lead.time ("Giờ theo đồng hồ máy bạn."). "pod ấm" → "pod chờ sẵn".
27. One verb for "load again": unify Đọc lại / Thử lại / Tải lại → "Tải lại" across admin (and ErrorState default label if it is app-provided).
28. One vocabulary for exam states across admin and student: admin.exams.state.upcoming vs exam.window.upcoming ("Chưa mở" vs "Sắp mở"), admin.exams.window.* vs exam.when.* ("tới"/"đến", "Mở ngay, không hạn chung" vs "Mở bất cứ lúc nào"). Pick one wording and use it in both surfaces.
29. problem.oj.tests.hidden-note → "…ẩn tên để không dò được đáp án qua lượt nộp."

## Skip
- packages/ui hard-coded Vietnamese defaults in primitives (pre-existing, package has no copy dependency by contract).

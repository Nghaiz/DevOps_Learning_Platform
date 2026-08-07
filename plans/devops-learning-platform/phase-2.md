# Phase 2 — Lessons pillar (MVP sản phẩm)

**Mức chi tiết:** DETAILED · **Effort:** M · **Blocks:** P4 (tái dùng UI/parser) · **Blocked by:** P1 (engine + terminal)

## Objective

Trụ cột ① — trải nghiệm học kiểu KillerCoda: bài markdown từng bước hiển thị cạnh terminal thật (split-pane), điều hướng step, và **validation script** chấm mỗi step trong sandbox. Tận dụng kho nội dung OSS định dạng Katacoda/Killercoda (`md` + `index.json`). Đây là MVP sản phẩm đầu tiên người dùng thấy giá trị.

**Định nghĩa "done" P2:** import 1 scenario Katacoda thật, người học đi qua các step, gõ trong terminal engine P1, bấm "Check" và validation script chạy trong pod trả pass/fail, tiến độ được lưu (chỉ chủ sở hữu xem được).

## Task list

### 2.A packages/scenario — parser Katacoda/Killercoda
1. Parse `index.json` (Katacoda/Killercoda): metadata, `details.steps[]`, `intro`, `finish`, `assets`, `backend.imageid` (map sang tier/image của ta), env/setup.
2. Parse từng `step{N}.md` (nội dung markdown) + `background`/`foreground` scripts (setup + validation) theo format Killercoda.
3. Chuẩn hóa sang DTO chung (`packages/shared-types`): `Scenario{id, title, difficulty, steps[]}`, `Step{index, markdownHtml, verifyScript?, setupScript?}`. Zod schema strict (luật 3).
4. Loader: đọc scenario từ thư mục repo (`content/scenarios/**`) và/hoặc DB; validate cấu trúc, báo lỗi rõ nếu format sai (errors-over-fallback).
5. Test parser trên kho thật (killercoda `scenario-examples` / grafana killercoda) — ≥ 3 scenario mẫu.

### 2.B DB & tRPC — nội dung + tiến độ
6. Schema Postgres (Drizzle): `scenarios` (metadata + ref nội dung), `progress{userId, scenarioId, stepIndex, status, updatedAt}`. Nội dung md có thể để trong repo/asset, DB giữ metadata + tiến độ.
7. tRPC router `lessons`: `list` (pagination cap 100 — luật 4), `get(scenarioId)`, `startSession(scenarioId)` (gọi orchestrator, gắn scenario setup vào pod), `saveProgress`, `checkStep(scenarioId, stepIndex)`.
8. **Object-level authz (luật 1):** `progress` mọi query lọc theo `ctx.user.id`; user không đọc/sửa progress người khác. Test IDOR.
9. Zod input strict mọi procedure (luật 3); reject field lạ.

### 2.C Validation engine — chấm step trong sandbox
10. `checkStep`: gateway/orchestrator exec `verifyScript` của step trong pod session (dùng đường exec P1), thu exit code + stdout → pass/fail. Timeout + giới hạn output.
11. Setup script chạy khi start scenario (chuẩn bị môi trường step). Idempotent nếu có thể.
12. Kết quả check cập nhật `progress.stepIndex`/`status`; trả cho FE.
13. Bảo mật: verifyScript chạy TRONG pod cô lập (không trên host/gateway); output cắt cỡ; không cho script thoát pod (đã có hardening P1).

### 2.D Frontend — split-pane lesson UI
14. Layout split-pane (resizable): trái = nội dung step (markdown render, code copy button, hình/asset), phải = terminal `packages/terminal` (engine P1).
15. Step navigation: Prev/Next, progress bar, đánh dấu step done; nút **"Check"** gọi `checkStep` → hiển thị pass/fail + hint.
16. Trang danh sách scenario (`/lessons`): grid, filter difficulty, trạng thái tiến độ (chỉ của user).
17. Trạng thái: đang provision sandbox, sandbox sẵn sàng, hết hạn (offer restart), lỗi validation.
18. Dùng `packages/ui` (shadcn); responsive; a11y cơ bản.

### 2.E Nội dung mẫu
19. Import 2–3 scenario Katacoda thật vào `content/scenarios/` (đã verify license) làm nội dung khởi đầu + smoke test toàn luồng.

## File / dir ownership

| Owner | Đường dẫn |
|---|---|
| Parser | `packages/scenario/**`, `packages/shared-types/scenario.ts` |
| DB/tRPC | `apps/web/src/server/db/schema/{scenarios,progress}.ts`, `apps/web/src/server/trpc/routers/lessons.ts` |
| Validation | `apps/web/src/server/lessons/validate.ts` (gọi gateway exec), có thể thêm RPC `ExecInSession` ở `proto/` nếu cần |
| FE UI | `apps/web/src/app/lessons/**`, `packages/ui/lesson/**` |
| Nội dung | `content/scenarios/**` |

**Tránh đụng file:** parser (2.A) và FE (2.D) song song sau khi DTO chung chốt. `checkStep` cần đường exec P1 — nếu thêm RPC mới vào `proto/`, pin contract trước.

## Dependencies

- **Blocks:** P4 (Labs tái dùng validation + UI; CTF tái dùng engine).
- **Blocked by:** P1 (terminal engine, exec-in-pod, session lifecycle).
- **Nội bộ:** 2.A DTO → 2.B/2.D; 2.C cần đường exec P1 (có thể cần mở rộng proto).

## Acceptance criteria

**Chức năng:**
- [ ] Import scenario Katacoda thật → parse không lỗi, hiển thị đủ step (test trên ≥3 scenario mẫu).
- [ ] Split-pane: nội dung trái + terminal phải hoạt động; resize được; code copy button hoạt động.
- [ ] Step nav Prev/Next + progress bar; step done được đánh dấu.
- [ ] Bấm "Check" → verifyScript chạy trong pod, trả pass/fail đúng (test 1 step pass + 1 step fail).
- [ ] Setup script chạy khi start; môi trường step đúng.
- [ ] Progress lưu và khôi phục khi quay lại scenario.

**Bảo mật (luật §6):**
- [ ] **Luật 1:** user A không đọc/sửa được `progress` của user B (tRPC 403 — test IDOR).
- [ ] **Luật 3:** input `checkStep`/`saveProgress` field lạ hoặc sai type → reject (Zod strict).
- [ ] **Luật 4:** `lessons.list` `limit` lớn → ép ≤100.
- [ ] **Validation isolation:** verifyScript chạy trong pod cô lập (không trên gateway/host); script cố `curl 169.254.169.254` trong verify → vẫn bị NetworkPolicy chặn (kế thừa P1).
- [ ] Output verify bị cắt cỡ (không cho dump khổng lồ gây DoS).

## Verify commands

```bash
# Parser trên kho thật
pnpm --filter @app/scenario test          # parse >=3 scenario mẫu, 0 lỗi
node packages/scenario/scripts/parse.mjs content/scenarios/intro-k8s   # in DTO

# tRPC lessons + IDOR
pnpm --filter web test -- lessons          # gồm test authz progress (userA != userB)

# checkStep e2e (thủ công/e2e): start scenario -> gõ giải -> Check => pass; sai => fail
pnpm --filter web test:e2e -- lessons-check

# list pagination cap
curl -s "https://host/api/trpc/lessons.list?input=%7B%22limit%22:100000%7D" | jq '.result.data | length'  # <=100
```

## Risk Assessment (P2)

| Rủi ro | Likelihood | Impact | Score | Mitigation |
|---|---|---|---|---|
| Format Katacoda/Killercoda biến thể → parser lệch | 3 | 3 | 9 | Test trên kho thật đa dạng; báo lỗi rõ format sai; hỗ trợ subset trước. |
| verifyScript chạy sai chỗ (leak ra host/gateway) | 2 | 5 | 10 | Bắt buộc exec TRONG pod session (đường P1); review; test isolation. |
| Progress IDOR | 2 | 4 | 8 | Authz theo ctx.user.id mọi query; test. |
| Setup script chậm → start scenario lâu | 3 | 2 | 6 | Chạy async, hiện trạng thái provisioning; cache image layer. |

Không rủi ro ≥15 ở P2 (đường găng đã ở P1). Rủi ro cao nhất là isolation của verifyScript → dựa trên hardening P1.

## Timeline (P2)

| Task nhóm | Effort | Notes |
|---|---|---|
| 2.A Parser | M | Blocks 2.B/2.D |
| 2.B DB + tRPC lessons | M | |
| 2.C Validation engine | M | Cần exec P1 |
| 2.D FE split-pane UI | M | Song song sau DTO |
| 2.E Nội dung mẫu | S | |
| **Total P2** | **M** | Critical sub-path: 2.A → 2.C (validation qua engine) |

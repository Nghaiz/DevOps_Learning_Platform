# 19.J exec — Mở chế độ làm bài OJ cho game CI/CD

**Mức chi tiết:** DETAILED · **Effort:** M (~5 ngày) · **Blocked by:** 19.G, 19.H (đã xong) · **Blocks:** ra đề thi CI/CD
**Nguồn phạm vi:** [`phase-19.md`](phase-19.md) §0b "Việc để lại của đợt 3" mục 1–3 · [`phase-18.md`](phase-18.md) §18.A/18.C (hệ OJ đa-game)
**Nhánh:** tách từ `main` sau khi nhánh P19 hiện tại gộp · **Plane:** bỏ qua theo `rules/no-outbound-from-this-project.md`.

---

## 0. Quyết định của chủ dự án (2026-09-17)

| # | Câu hỏi | Chốt |
|---|---|---|
| 1 | Nhật ký phải chở thêm núm retries/cache và chính sách CD. Đổi thế nào | **Đổi hẳn hình dạng action.** Không giữ biến thể cũ, không viết đường di trú |
| 2 | Tám vị từ chương CD có mở trong chặng này không | **Có.** `CicdProblemSpec` chở kịch bản CD, mở đủ 8 vị từ |

**Hệ quả của quyết định 1, nói thẳng vì nó là thứ dễ quên:** mọi `RunLog` CI/CD đã ghi trước đây
thành không hợp lệ.

Suy từ MÃ NGUỒN: chế độ làm bài CI/CD chưa bao giờ mở (`cicd-game.tsx` trả màn "Chế độ làm bài
chưa mở"), nên không có đường nào ghi được một `RunLog` CI/CD.

**ĐÃ ĐO trên DB phát triển (docker compose, 2026-09-17)** — không còn là suy luận:

```
select game_id, count(*) from problems group by game_id;   ->  k8s | 10   (KHÔNG có cicd, cũng không có git)
select count(*) from problem_submissions;                  ->  0
```

Không bài CI/CD nào tồn tại và **chưa có lượt nộp nào trong toàn bảng**, nên tập bản ghi bị vỡ là
rỗng và việc đổi hẳn không tốn một đường di trú nào. ⚠ Phạm vi phép đo: DB cục bộ của máy phát
triển. Trước khi chạy J.1.1 trên một môi trường khác (cụm lab, hay bản đã có người dùng), chạy lại
đúng hai truy vấn đó; có dòng nào thì DỪNG và hỏi lại chủ dự án, vì lúc đó "đổi hẳn" không còn rẻ
như khi ra quyết định.

---

## 1. Hiện trạng đo được (2026-09-17, đọc mã)

| Câu hỏi | Đo được |
|---|---|
| Client vào chế độ làm bài bằng đường nào | `cicd-game.tsx` nhánh `problemCode !== null` trả một màn "chưa mở" kèm mã bài. Không có màn làm bài |
| Action CI/CD hiện chở gì | `core/run-log.ts:151-155`: `evaluate { source }` (chuỗi YAML) và `hint { index }`. Không có núm, không có chính sách CD |
| Bộ chấm dùng action nào | `cicd/problem-plugin.ts:494-512`: lấy `source` của action `evaluate` **cuối cùng**; nhật ký rỗng thì chấm `initialState.workflow` |
| Đề bài chở gì | `CicdProblemSpec` = `{ workflow, workload, evaluation }` (`problem-plugin.ts:130-134`). Không có khối CD |
| Vì sao 8 vị từ CD bị cấm khai | `CICD_IMPLEMENTED_PREDICATE_NAMES` trừ `CD_SIMULATION_PREDICATES` vì "bộ ba của bài OJ không chở kịch bản nào"; khai chúng là mời một bài mọi lượt nộp đều trượt |
| Game nào đã mở chế độ làm bài | K8s (`k8s-arena/arena-problem.tsx` + `use-problem-submit.ts`) và Git (`games/git/git-problem.tsx`, 329 dòng) |
| Ai chấm | **Máy chủ.** `problems.byCode` cắt `check`/`args` của mọi testcase trước khi rời máy chủ (§18.B.4), nên client không cầm cách chấm. Client gọi `problems.tryGrade` rồi `problems.submit` — hai lượt gọi, cùng trần nhịp, tức trần nộp thật là 3 lần/phút |
| Bộ chấm có tất định không | Hợp đồng `GameProblemPlugin.grade` đòi tất định từng byte ở cả trình duyệt lẫn Node; `CICD_UNSEEDED_REPLAY_SEED = 1` |

---

## 2. Hợp đồng đổi — chốt trước, không lane nào sửa

### 2.1 `CicdGameAction` (`packages/games/src/core/run-log.ts`)

```
| { gameId: 'cicd'; tick; kind: 'evaluate';
    source: string;                    // YAML người chơi gửi
    overrides: CicdPlayerOverrides;    // núm retries + cache (hydrate.ts)
    cd: CicdCdPolicies | null }        // chính sách CD, null khi bài không có kịch bản CD
| { gameId: 'cicd'; tick; kind: 'hint'; index: number }
```

Ba trường **bắt buộc** cả ba, không tuỳ chọn: một trường tuỳ chọn ở đây là một bản ghi không nói
được sự khác nhau giữa "người chơi không xoay núm nào" và "client quên gửi". Hai thứ đó chấm ra
hai kết quả khác nhau.

### 2.2 `CicdProblemSpec` (`packages/games/src/cicd/problem-plugin.ts`)

```
{ workflow, workload, evaluation, cd?: CicdProblemCd }

CicdProblemCd = {
  release?: { scenarios: ReleaseScenario[]; evaluation: ReleaseEvaluationSpec }
  gitops?:  { scenario: GitOpsScenario }
  masking?: { scenario: MaskingScenario }
  editable: CdPolicyPart[]      // núm người làm được xoay
  initial:  CicdCdPolicies      // chính sách khởi điểm
}
```

Đây là **đúng hình dạng `CicdLevelCd` trừ `solution`/`altSolution`** — hai trường đó là lời giải
của level, và một đề thi không chở lời giải. Khai lại một kiểu gần giống là mời hai hình dạng trôi
khỏi nhau: lấy kiểu bằng `Omit<CicdLevelCd, 'solution' | 'altSolution'>` để chúng không thể lệch.

### 2.3 Máy chủ khoá chính sách, không tin client

`grade()` gọi `mergeCdPolicies(spec.cd.initial, action.cd, spec.cd.editable)` **trước** khi mô
phỏng. Người làm gửi một chính sách nằm ngoài `editable` thì nó bị bỏ, y như lúc chơi level. Không
có bước này, một bài "tìm đúng ngưỡng canary" giải được bằng cách sửa luôn kịch bản.

Tương tự, `hydrateWorkflow` + `checkJobShapes` vẫn chạy trên bản nộp: khuôn job và khuôn tập job
là thứ chặn hai đường lách đã đo ở review PR #141.

---

## 3. Chuỗi công việc

### 19.J.1 — Hợp đồng và bộ chấm (M, ~2 ngày; LEAD, commit trước khi fan-out)

| # | Việc | Ước |
|---|---|---|
| J.1.1 | Đổi `CicdGameAction.evaluate` theo §2.1; sửa mọi nơi dựng action | 3h |
| J.1.2 | `CicdProblemSpec.cd` theo §2.2, dùng `Omit<CicdLevelCd, ...>` | 2h |
| J.1.3 | `gradeCicdProblem`: ghép YAML + `overrides` qua `hydrateWorkflow`, khoá CD qua `mergeCdPolicies`, chạy `runLevelCd`, đưa bản ghi vào ngữ cảnh vị từ | 4h |
| J.1.4 | Mở `CD_SIMULATION_PREDICATES` trong `CICD_IMPLEMENTED_PREDICATE_NAMES` **chỉ khi** bài có khối `cd` tương ứng; bài không có kịch bản mà khai vị từ CD là lỗi cổng, không phải một bài khó | 3h |
| J.1.5 | Test tất định: cùng `(spec, actions, seed)` ra cùng `GradeResult` qua 200 lượt, ở cả env `node` lẫn `jsdom` | 3h |
| J.1.6 | Test hai chiều tên vị từ: mọi tên khai được có hiện thực, và mọi hiện thực chấm được đều khai được (trừ danh sách chưa-hiện-thực có tên) | 2h |
| J.1.7 | Test chống lách: chính sách ngoài `editable` bị bỏ; workflow lệch khuôn job không được chấm; bản nộp rỗng chấm `initialState.workflow` | 3h |

### 19.J.2 — Trang soạn bài (S, ~1 ngày)

| # | Việc | Ước |
|---|---|---|
| J.2.1 | `CICD_AUTHOR_FIELDS` thêm phần khai khối `cd` (kịch bản phát hành/GitOps/masking, `editable`, `initial`) | 4h |
| J.2.2 | Kiểm lúc lưu: khai vị từ CD mà thiếu kịch bản tương ứng thì báo lỗi ngay ở form, nói rõ thiếu khối nào | 3h |
| J.2.3 | Ô test cho `/author/problems` với `gameId: 'cicd'` có khối CD | 2h |

### 19.J.3 — Màn làm bài phía client (M, ~2 ngày)

Khuôn mẫu: `games/git/git-problem.tsx`. Đọc nó trước, gồm cả khối chú thích đầu file.

| # | Việc | Ước |
|---|---|---|
| J.3.1 | `cicd-problem.tsx`: tự cấp `TrpcQueryProvider` (layout `/games` CỐ Ý không cấp, để AC-2 giữ được 0 lời gọi backend lúc chơi level), nạp bằng `next/dynamic` từ `cicd-game.tsx` | 3h |
| J.3.2 | Đọc đề qua `problems.byCode`, dựng màn chơi từ `spec` (workflow ban đầu + workload + evaluation + khối CD) | 4h |
| J.3.3 | Ghi nhật ký: mỗi lần bấm "Chạy thử" đẩy một action `evaluate` đủ ba mảnh; mở gợi ý đẩy `hint` | 3h |
| J.3.4 | Nộp bài: `problems.tryGrade` rồi `problems.submit`, lời khai dựng từ kết quả máy chủ trả (KHÔNG tự tính điểm ở client) | 4h |
| J.3.5 | Hiện verdict bằng `toVerdictView` của `packages/games` — nguồn DUY NHẤT được phép suy verdict | 2h |
| J.3.6 | Bỏ màn "Chế độ làm bài chưa mở"; cập nhật `cicd-game.tsx` và chú thích của nó | 2h |

### 19.J.4 — Nghiệm thu và cổng (S, ~1 ngày)

| # | Việc | Ước |
|---|---|---|
| J.4.1 | e2e `games-cicd-problem.spec.ts`: soạn một bài CI + một bài CD qua `/author/problems`, làm bài, nộp, nhận verdict; thêm vào `e2e:ci` | 4h |
| J.4.2 | Ô đối chứng âm: bản nộp sai phải ra WA, và một bản nộp đúng nhưng xoay núm ngoài `editable` vẫn ra đúng verdict như khi không xoay | 3h |
| J.4.3 | Cập nhật `docs/games/cicd.md` phần "việc còn mở" và `phase-19.md` §0b | 2h |

---

## 4. Ô nghiệm thu

| # | Ô | Đo bằng |
|---|---|---|
| AC-J1 | Bài CI/CD làm được từ đầu tới verdict | e2e: soạn, làm, nộp, thấy verdict AC |
| AC-J2 | Núm retries/cache tới được bộ chấm | Test: cùng YAML, hai bộ `overrides` khác nhau ra hai `GradeResult` khác nhau |
| AC-J3 | Chính sách CD tới được bộ chấm | Test: cùng YAML, hai bộ `cd` khác nhau ra hai verdict khác nhau trên một bài dùng vị từ CD |
| AC-J4 | Máy chủ khoá chính sách | Test: gửi chính sách ngoài `editable` cho verdict GIỐNG hệt khi không gửi |
| AC-J5 | Tất định | 200 lượt cùng đầu vào ra cùng đầu ra, ở `node` và `jsdom` |
| AC-J6 | Vị từ CD chỉ mở khi có kịch bản | Cổng: bài khai vị từ CD mà thiếu khối `cd` bị từ chối lúc lưu, có đối chứng dương |
| AC-J7 | AC-2 không vỡ | Network trace: `/games/cicd` KHÔNG có `?problem=` vẫn 0 lời gọi backend |
| AC-J8 | Không lách được bằng khuôn job | Test: bản nộp đổi tên bước hoặc bỏ job kiểm thử không được chấm |

---

## 5. Rủi ro

| Rủi ro | L | I | Điểm | Giảm thiểu |
|---|---|---|---|---|
| Verdict client khác verdict máy chủ ⇒ người giải ĐÚNG bị từ chối | 3 | 5 | 15 | Client không chấm; verdict chỉ đến từ máy chủ, dựng qua `toVerdictView` |
| Đổi hình dạng action làm hỏng bản ghi cũ | 1 | 4 | 4 | **Đã đo 2026-09-17**: 0 bài `cicd`, 0 dòng `problem_submissions` trên DB phát triển. Chạy lại hai truy vấn đó trên môi trường khác trước khi áp J.1.1 ở đó |
| Bài CD ra đề không giải được vì thiếu núm | 3 | 4 | 12 | J.2.2 kiểm lúc lưu; thêm một ô test chạy thử "lời giải mẫu" của chính người soạn |
| Giá trị `NaN` từ bảng núm đi vào bộ mô phỏng phía máy chủ | 3 | 3 | 9 | Zod chặn ở biên `problems.submit`; bộ mô phỏng vẫn ném và `grade` bắt thành lỗi bài làm, không thành 500 |
| Hai lượt gọi mỗi lần nộp ăn trần nhịp | 2 | 3 | 6 | Ghi rõ trần thật (3 lần/phút) trên màn, như game Git đã làm |

---

## 6. Lệnh xác minh

```
cd packages/games && npx vitest run src/cicd src/core && npx tsc --noEmit -p .
cd apps/web && npx vitest run src/components/games/cicd src/app/author && npx tsc --noEmit
cd <repo> && pnpm turbo run build lint typecheck test --force --concurrency=3
docker compose up -d postgres redis && pnpm --filter @devops-platform/web db:migrate
pnpm --filter @devops-platform/web build
cd apps/web && E2E_START_SERVER=1 E2E_BASE_URL=http://localhost:3000 E2E_ORIGIN=http://localhost:3000 npx playwright test games-cicd-problem.spec.ts games-cicd.spec.ts
```

⚠ Bài OJ cần Postgres thật; ô e2e phải tự soạn đề của nó rồi dọn, không dựa vào dữ liệu có sẵn.
⚠ Thêm spec mới vào `e2e:ci`, nếu không nó không gác gì.

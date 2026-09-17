# Lane 18.B — verdict, testcase ẩn, lỗi biên dịch

**Ngày:** 2026-09-14 · **Nhánh:** `feat/p18-oj-exam` · **Việc:** 18.B.3 · 18.B.4 · 18.B.5

---

## 1. Điều quan trọng nhất: lỗ rò của 18.B.4 là lỗ rò ĐANG CÓ, không phải phòng xa

Trước bản này, đường của người học trả thẳng `Objective[]` — tức `check` và `args`
của mọi điều kiện chấm — xuống trình duyệt:

| Điểm cuối | Rò gì | Đo bằng |
|---|---|---|
| `problems.byCode` | `check` + `args` của mọi objective của bài đang mở | `k8s/problem.ts:221` — `ProblemForSolver = Omit<Problem, 'hints'>`, tức `objectives` đi nguyên |
| `problems.list` | cùng thứ đó, cho **tối đa 20 bài mỗi trang** | `list.ts` cũ gọi cùng `toSolverProblem` |

Và trang `/problems/[code]` **chưa bao giờ đọc tới `objectives`** — grep 2026-09-14
trên `app/(session)/problems/**` ra 0 kết quả; `problem-overview.tsx` vẽ mã, tên,
độ khó, chủ đề, tag, đề bài, hạn giờ. Nên đó là dữ liệu gửi đi mà không ai dùng,
và ai mở tab công cụ nhà phát triển đều đọc được cách chấm.

`k8s/problem.ts:216-219` còn ghi thẳng rằng đó là **chủ ý**:

> `objectives` thì KHÔNG che, và đó là chủ ý: nhãn mục tiêu chính là đề bài […]
> Tham số vị từ đi kèm có hé lộ con số cụ thể, nhưng nhãn vốn đã nói ra con số đó
> rồi, không có gì để giấu thêm.

`core/problem.ts` § `TestcaseTeaser` **đảo lại quyết định đó**, cũng tường minh:
`check`/`args` không có mặt *"ở bất kỳ trường hợp nào, kể cả với testcase hiện"*.
Bản này thi hành quyết định mới.

---

## 2. Đối chứng dương của ô "không rò testcase ẩn" — đã chạy

Yêu cầu: ô đó phải **đỏ được** nếu ai đó lỡ trả `Testcase` đầy đủ
(`rules/green-that-proves-nothing.md`).

**Cách chạy.** Sao lưu `solver.ts`, rồi thay hai dòng che bằng phép trả nguyên vẹn:

```ts
- testcases: toTestcaseTeasers(problemTestcases(objectives), hasSubmitted),
+ testcases: problemTestcases(objectives) as never,
```

**Kết quả — 3 ô đỏ, đúng ba ô gác:**

```
× phản hồi của người học không chứa `check` hay `args` của BẤT KỲ testcase nào
× đã nộp thì nhãn hiện ra, nhưng cách chấm vẫn ở lại máy chủ
× đường người soạn của trang chi tiết cũng không chở cách chấm
AssertionError: expected '{"code":"K8S-0042","slug":"bai-mau","…' not to contain 'deployment-replicas-ready'
Tests  3 failed | 10 passed (13)
```

Khôi phục `solver.ts` từ bản sao lưu ⇒ `13 passed (13)`, và `git diff` trên file
đó rỗng.

**Hai điều làm ô này đo đúng thứ nó định đo:**

1. **Khẳng định trên CHUỖI đã serialize**, không trên đường dẫn thuộc tính. Một ô
   đọc `result.testcases[0].check` vẫn xanh khi cách chấm rơi vào một trường
   KHÁC (`objectives`, `meta`, một field mới của `Testcase`). Chuỗi không có chỗ trốn.
2. **Có vế HTTP thật** (`solver-wire.integration.test.ts`), không chỉ `createCaller`.
   `createCaller` bỏ qua tầng serialize của tRPC — repo này đã trả giá một lần
   (router xanh, HTTP thật 500 vì `bigint`). Ô HTTP dựng `Request` thật, đi
   `fetchRequestHandler`, đọc `response.text()`, và kèm **đối chứng dương trong
   cùng lượt**: nhãn testcase HIỆN và mã bài phải CÓ MẶT, để một phản hồi rỗng
   hoặc một lỗi trả về sớm không đọc thành đạt.

---

## 3. Đã làm

| Mục | File | Trạng thái |
|---|---|---|
| B.4 che testcase ở máy chủ | `server/problems/testcases.ts` | Xong |
| B.4 kiểu trên dây bỏ `objectives` | `server/problems/solver.ts` | Xong |
| B.4 đường danh sách | `server/problems/list.ts` → `listProblemsForSolver` | Xong |
| B.4 đường chi tiết | `server/problems/get.ts` | Xong |
| B.4 danh sách testcase trên trang bài | `app/(session)/problems/[code]/problem-testcases.tsx` | Xong, đã nối |
| B.3 + B.5 suy verdict | `server/problems/verdict-view.ts` | Xong |
| B.3 + B.5 vẽ verdict | `app/(session)/problems/[code]/problem-verdict.tsx` | Xong, **chưa có chỗ gọi** (§4.4) |
| B.3 verdict của lượt vừa nộp | `server/problems/submit.ts` → `SubmitProblemResult.grade` | Xong, **không lưu được** (§4.2) |

**AC-B đo được:** `verdict-view.test.ts` § `AC-B — 5 testcase, qua 4` khẳng định
đúng câu của plan — verdict `WA`, phân số `4/5`, và `failed` bằng đúng
`[{ id: 't3', … }]`, một phần tử.

**Nguồn suy verdict là một, không hai.** `verdictFromVerify` gọi `problemVerdictOf`
của `packages/games`; tầng web không viết lại `passed === total`. Có ô test khẳng
định hai bên trùng nhau trên bốn cặp `(passed, total)` — đó là thứ làm phép so
verdict của §18.C.3 nói về engine chứ không nói về hai hàm.

---

## 4. Hợp đồng của lead — chỗ thiếu

### 4.1 `ProblemForSolver` của `core/` không ra tới barrel

`core/problem.ts` ĐÃ khai `ProblemForSolver<Spec>` đúng hình dạng cần
(`testcases: TestcaseTeaser[]`), nhưng `index.ts` không mở nó: cái tên đang bị
bản cũ của `k8s/problem.ts` chiếm, và khối *"TRẠNG THÁI TRUNG GIAN CÓ CHỦ Ý"*
liệt kê nó vào chín tên tồn tại ở cả hai chỗ.

Lane này **không** tự thêm dòng vào barrel (lead sở hữu) và **không** khai lại
một `Testcase` thứ hai. Thay vào đó nó dựng `SolverProblem` tại
`server/problems/solver.ts` **từ các mảnh đã mở** (`TestcaseTeaser`,
`ProblemHintTeaser`, `Problem`). Khi 18.A hợp nhất hai bản khai, kiểu đó bỏ đi.

> **Cần lead quyết:** mở `ProblemForSolver` của `core/` dưới một tên tạm
> (`CoreProblemForSolver`?), hay để tầng web giữ kiểu riêng cho tới lúc hợp nhất.

### 4.2 Không có cột nào chở `testcases`, `passed`, `total`

`problems` có `objectives jsonb`, không có `testcases`.
`problem_submissions` có `solved` + `score`, không có `passed text[]` + `total integer`.

Hệ quả **đo được**, không phải phỏng đoán:

- `visible` chưa ghi được từ đâu cả. Trang soạn bài là §18.D.2, chưa làm. Nên phép
  che ở bản này đúng nhưng chưa có gì để che trên dữ liệu thật — ô test phải dựng
  testcase ẩn trực tiếp vào jsonb.
- **Lịch sử nộp bài KHÔNG hiện được `WA (4/5)`.** Đây là nửa còn thiếu của B.3.
  `core/problem.ts` § `Submission` nói rõ vì sao `passed`/`total` phải là **sự
  thật lịch sử** chốt tại thời điểm nộp: suy lại từ bài hôm nay sẽ đọc một lượt
  `WA (4/5)` của hôm qua thành `WA (4/7)` sau khi tác giả thêm hai case. Nên lane
  này **không** suy lại, và để trống thay vì vẽ một con số sai.

Cả hai nằm ở `apps/web/src/server/db/schema.ts` — lane lớp học sở hữu, và plan
§18.B **không giao món này cho ai**.

> **Cần lead giao:** ai thêm `problems.testcases`, `problem_submissions.passed`,
> `problem_submissions.total`, và bước di trú từ `objectives`.

### 4.3 `ProblemVerdict` có ba giá trị, mã có BỐN trạng thái

`verifyRun` phân biệt năm `VerifyStatus`. Bốn trong số đó gộp được về ba verdict
một cách tự nhiên. Còn `khong-khop` thì không:

| Trạng thái thật | Verdict đúng |
|---|---|
| đạt | `AC` |
| chưa đạt | `WA (n/m)` |
| không chạy được (`log-hong`, `phat-lai-loi`, `engine-khong-tat-dinh`) | `CE` |
| **chạy được nhưng không xác minh được** (`khong-khop`) | **không có nhãn nào đúng** |

Lượt `khong-khop` CHẠY TỚI NƠI, nên đúng nghĩa nó không phải `CE`. Nhưng máy chủ
không cầm được tập `passed` của chính mình từ `verifyRun` (hàm đó trả `mismatches`
dạng chuỗi, không trả `objectivesMet` đã phát lại), nên con số duy nhất trong tay
là lời khai của client — thứ vừa bị chứng minh là không khớp. In `WA (4/5)` từ nó
là nói dối; in `WA (0/5)` cũng nói dối theo chiều ngược lại.

Bản này chọn `CE`, vì đó là nhãn duy nhất mang đúng tính chất cần có (*"`passed`/`total`
không nói lên gì"* ⇒ không in phân số), và bù bằng một `failedReason` nói rõ
chuyện gì đã xảy ra. Ghi lại tại chỗ khai trong `verdict-view.ts`.

> **Cần lead quyết:** thêm một verdict thứ tư, hay để `khong-khop` ở lại `CE` kèm
> lý do. §18.C sẽ đụng đúng chỗ này vì lúc đó máy chủ tự phát lại và tự có
> `passed` — có thể `khong-khop` biến mất khỏi bài toán verdict hoàn toàn.

### 4.4 `problems.submit` KHÔNG có chỗ gọi nào trong `apps/web`

Grep 2026-09-14: `api.problems.submit` xuất hiện **0 lần** ngoài chính router và
`submit.ts`. Nút *"Bắt đầu làm bài"* đưa người dùng sang `/games/k8s?problem=<mã>`,
và đấu trường chưa bao giờ nộp bài về máy chủ.

Nên toàn bộ đường chấm lại phía máy chủ hiện là mã không ai gọi tới — cùng khuôn
bài học `CHALLENGES` mà barrel đã ghi. `problem-verdict.tsx` vì vậy có test nhưng
chưa có màn hình.

Lane này **cố ý không dựng một chỗ gọi giả** trên `/problems/[code]`: trang đó chỉ
có cột `solved`, mà `solved` đếm theo mục tiêu **bắt buộc** còn verdict đếm theo
**mọi** testcase — hai số lệch nhau ở bài có mục tiêu thưởng, nên vẽ `AC` từ
`solved` là vẽ một verdict có thể sai.

> **Cần lead giao:** nối đấu trường vào `problems.submit` (thuộc
> `components/k8s-arena/**`, không phải lane này).

### 4.5 Ba export của lane engine — CHƯA có lúc bắt đầu, ĐÃ có lúc kết thúc

Lúc lane này bắt đầu, `packages/games/src/problem-plugins.ts` **chưa tồn tại**
(`PROBLEM_PLUGINS`, `problemPluginMeta`, `gradeProblemRun` đều 0 kết quả khi grep).
Theo brief, lane này **không** tạo file đó và **không** dựng một bản chấm song
song. B.3/B.4/B.5 làm được trọn vẹn bằng các kiểu đã mở sẵn qua barrel
(`Testcase`, `TestcaseTeaser`, `GradeResult`, `ProblemVerdict`, `problemVerdictOf`),
nên không có chỗ nào phải chờ.

Lane engine landed trong cùng phiên (`bdc1dfd`, `ae7ed23`). Đã kiểm lại: cả bốn
kiểu lane này dựa vào — `Testcase`, `TestcaseTeaser`, `GradeResult`,
`problemVerdictOf` — **không đổi một dòng nào**. Hai chỗ hợp đồng đổi thật
(`seed: number | null` → `number`, thêm `targetState?`) không chạm mã của lane này.

**Chỗ nối còn lại, KHÔNG thuộc 18.B.** `server/problems/submit.ts` đang suy
`passed` từ `claimed.objectivesMet` **đã qua xác minh phát lại** — hợp lệ, vì
`verifyRun` chỉ trả `da-xac-minh` khi số phát lại bằng đúng số đã khai. Đổi nó
sang gọi thẳng `gradeProblemRun` là **§18.C** (chấm lại phía server), không phải
§18.B, nên lane này để nguyên thay vì lấn sang. Khi đổi, hai thứ đi kèm:

- bắt `UnknownProblemGameError` (hàm NÉM thay vì trả `GradeResult` rỗng);
- lúc đó máy chủ có tập `passed` của CHÍNH MÌNH, nên nhánh gượng `khong-khop`
  ở §4.3 có thể biến mất khỏi bài toán verdict hoàn toàn.

---

## 5. Đo được

| Cổng | Kết quả |
|---|---|
| `pnpm --filter web typecheck` | **xanh** (gồm cả `e2e/tsconfig.json`) |
| `pnpm --filter web lint` | **xanh** |
| `pnpm --filter @devops-platform/copy test` | **xanh**, 71/71 |
| `testcases.test.ts` + `verdict-view.test.ts` | **xanh**, 29/29 |
| `solver-wire.integration.test.ts` (HTTP thật, Postgres thật) | **xanh**, 2/2 |
| Đối chứng dương ô chống rò | **đỏ đúng 3 ô** khi gỡ phép che |
| `pnpm --filter web test` (toàn bộ) | **xanh**, 180 file / 2166 ô |
| `pnpm --filter web build` (`next build` thật) | **xanh**, `/problems` và `/problems/[code]` đều dựng |
| Chạy lại `src/server/problems/` sau khi lane 18.A landed | **xanh**, 7 file / 95 ô |

⚠ `pnpm --filter web test` với mặc định song song **hết RAM** trên máy này
(`FATAL ERROR: Committing semi space failed`, exit 134) khi các lane khác đang
chạy cùng lúc: đo được 41 tiến trình `node` và 6.5 GB trống trên 40 GB. Đó là
tranh tài nguyên, không phải một ô đỏ. Chạy lại với `--maxWorkers=3` ⇒ xanh toàn
bộ. Xem bẫy §6.1 về việc `--poolOptions` không còn ở CLI của vitest 4.

---

## 6. Bẫy gặp phải, ghi lại để lane sau khỏi dẫm

1. **`--poolOptions` không còn ở CLI của vitest 4.** `vitest run --poolOptions.threads.maxThreads=3`
   ném `CACError: Unknown option --poolOptions` chứ không bỏ qua trong im lặng.
   Đường còn sống là `--maxWorkers=N`. Cùng họ với bẫy `environmentMatchGlobs` đã
   ghi trong `vitest.config.ts`.
2. **Lane chỉ chạy `typecheck` + `test` thì lint không ai chạy.** `tsc` mù với
   import thừa; `verdict-view.ts` mang một `type Testcase` không dùng đi qua
   typecheck xanh và chỉ đỏ ở `eslint`.
3. **`listProblemsInput` là `.strict()` và `query` nằm TRONG `filter`.** Đặt ở gốc
   trả 400 với `Unrecognized key: "query"`, không phải bỏ qua trong im lặng.
4. **Tách hai đường danh sách chứ không thu hẹp một kiểu dùng chung.**
   `app/author/problems/problem-list-client.tsx` khai `row: ProblemWithStats` và
   thuộc lane khác. Nên `listProblems` giữ nguyên hình dạng cũ cho `problems.mine`,
   còn `problems.list` đi `listProblemsForSolver`. Typecheck xác nhận cách chia
   này không chạm file của lane nào khác.

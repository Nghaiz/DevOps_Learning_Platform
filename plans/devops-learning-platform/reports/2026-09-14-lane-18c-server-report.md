# Lane 18.C — nửa MÁY CHỦ của đường nộp bài

**Nhánh:** `feat/p18-oj-exam` · **PR:** #137 · **Ngày:** 2026-09-14

Đóng nửa máy chủ để 18.C (chấm-lại) có đường đi qua: hai cột mới trên
`problem_submissions`, `submit.ts` chấm bằng `gradeProblemRun`, và lịch sử nộp
bài dựng lại được `WA (n/m)`.

---

## 1. Cột + migration

| Cột | Kiểu SQL | Mặc định | Ý nghĩa |
|---|---|---|---|
| `passed` | `text[] NOT NULL` | `'{}'` | Id các testcase ĐÃ QUA — **id chứ không phải chỉ số** |
| `total` | `integer NOT NULL` | `0` | Số testcase của bài **tại thời điểm nộp** |

**Migration:** `apps/web/drizzle/0014_spotty_hiroim.sql` (sinh bằng `pnpm db:generate`,
kèm `drizzle/meta/0014_snapshot.json` + `_journal.json`).

```sql
ALTER TABLE "problem_submissions" ADD COLUMN "passed" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "problem_submissions" ADD COLUMN "total" integer DEFAULT 0 NOT NULL;
```

### Vì sao `total` KHÔNG vi phạm No Derived Fields

Ghi thẳng vào chú thích cột ở `schema.ts` chứ không chỉ ở đây, vì vế suy-ra-được
hay nấp cạnh vế hợp lệ: `total` **không** suy được từ bài lúc đọc ra, vì bài có
thể bị sửa SAU lượt nộp. Nó là **sự thật lịch sử** — "lúc nộp, bài có bấy nhiêu
testcase". Không chốt lại thì một lượt `WA (4/5)` hôm nay tự đọc thành `WA (4/7)`
sau khi tác giả thêm hai case, và cả lịch sử làm bài của mọi người lặng lẽ đổi
nghĩa. Hợp đồng `core/problem.ts` § `Submission` ghi cùng điều đó cho `passed`.

Mặc định `0` cho dòng cũ là **đúng nghĩa**, không phải chỗ giữ chỗ:
`problemVerdictOf(_, 0)` trả `CE`, và một lượt nộp ghi trước 18.C thật sự không
chấm được theo mô hình testcase.

**Không thêm cột điểm-theo-testcase.** Điểm là `passed.length / total`, tính ở
chỗ dùng. Cột `score` đang có là của mô hình cũ (0..1000 theo gợi ý + số nước) —
một đại lượng khác, không gộp.

---

## 2. `submit.ts` — chấm bằng `gradeProblemRun`

`gradeSubmission(problem, log, verifyStatus)` trong `server/problems/submit.ts`:

- `gradeProblemRun({ gameId: log.gameId, initialState: problem.initialState,
  actions: log.actions, testcases: problemTestcases(problem.objectives), seed: log.seed })`
- `seed` lấy từ **`log.seed`**, không phải hằng tự đặt — lý do đầy đủ ở
  `core/problem.ts` § `Submission.seed` (hai hằng lệch nhau ⇒ hai thế giới đầu
  khác nhau ⇒ mọi lượt nộp hợp lệ bị từ chối).
- `UnknownProblemGameError` bắt **theo lớp** (`error instanceof`), không so chuỗi
  thông điệp → `INTERNAL_SERVER_ERROR` (không phải 400: người nộp không làm gì sai;
  một bài `published` thuộc game chưa có plugin là lỗi cấu hình nền tảng).

**Đã xoá:** `passedTestcaseIds()` và `testcaseTotal()` — hai hàm cũ đọc
`claimed.objectivesMet` (lời khai client). Đường đó nay đứt hẳn.

### Một quyết định cần lead biết: `passed` KHÔNG đi qua cổng `verifyRun`

`gradeProblemRun` không đọc `claimed` một chữ nào — nó phát lại `log.actions` trên
`problem.initialState` rồi chạy vị từ từng testcase trên trạng thái cuối. Kết quả
là sự thật của máy chủ dù client khai gì. Hai cột cũ (`score`, `solved`) thì khác:
giá trị duy nhất máy chủ cầm cho chúng LÀ lời khai, nên chúng vẫn phải qua cổng.

Ngoại lệ duy nhất còn hỏi `verifyRun`: **`engine-khong-tat-dinh`**.
`gradeProblemRun` phát lại một lần nên không thấy được engine không tất định;
`verifyRun` phát lại hai lần và bắt được. Ở nhánh đó không con số nào đáng tin,
kể cả số của chính lần phát lại này ⇒ `passed` bỏ, verdict về `CE`.

Hệ quả tích cực, và nó đóng đúng cái khe mà `verdict-view.ts` đã ghi lại: máy chủ
nay **cầm được tập `passed` của chính mình**, nên nhánh `khong-khop` không còn
buộc phải in một lời khai đã trượt xác minh.

---

## 3. Lịch sử nộp bài hiện `WA (n/m)`

- `dto.ts` → `ProblemSubmissionWithGrade extends ProblemSubmission` mang thêm
  `passed` + `total`. `extends` nên mọi chỗ đang nhận `ProblemSubmission` không
  phải đổi gì.
- `verdict-view.ts` → `gradeFromSubmission({ passed, total })` dựng lại
  `GradeResult` từ một dòng lịch sử, verdict suy qua `problemVerdictOf` (nguồn sự
  thật duy nhất — §18.C.3), **không** viết tay `passed.length === total`.
- `submissions.ts` → `SubmissionPage.items` đổi sang kiểu mới; **không** tính lại
  `total` ở chỗ đọc.

**⛔ Cố ý không có trường `verdict` trên dây:** verdict suy được từ
`(passed, total)`, gửi kèm nó là gửi cùng một sự thật hai lần.

---

## 4. Đối chứng dương — đã chạy, từng nhóm ô một

Theo `rules/green-that-proves-nothing.md`: phá có chủ ý → xác nhận đỏ **đúng tên
ô** → khôi phục → `git diff` trống.

### PC-1 — `total` tính lại lúc đọc (hồi quy thực tế nhất)

Sửa `listMySubmissions` join sang `problems` và ghi đè `total` bằng
`problemTestcases(bài-hôm-nay).length` — đúng cái "dọn dẹp trường suy ra được"
mà một người có thiện chí sẽ làm nếu cột `total` không có chú thích.

```
× lượt nộp cũ vẫn `4/5` chứ không phải `4/6`      AssertionError: expected 6 to be 5
× lịch sử dựng lại verdict `WA (4/5)` …            AssertionError: expected 6 to be 5
  Tests  2 failed | 4 passed (6)
```

Đỏ **đúng hai ô của AC-2**, xanh nguyên bốn ô AC-1 (kho lưu vẫn đúng; chỉ đường
đọc nói dối). Đây là bằng chứng sắc nhất rằng AC-2 đo đúng tính-lịch-sử chứ không
đo một thứ khác.

### PC-2 — máy chủ ngừng tự chấm

Chèn `return gradeOf(status, [], testcases.length)` trước `gradeProblemRun`.

```
× phản hồi trên DÂY mang verdict `WA (4/5)`        expected 'CE' to be 'WA'
× ĐỌC LẠI TỪ DB ra đúng 4 id và `total` 5          expected [] to deeply equal [t1..t4]
× `passed` KHÔNG tới từ lời khai của client        expected [] to have a length of 4
× lượt nộp cũ vẫn `4/5` …                          expected [] to have a length of 4
× lịch sử dựng lại verdict `WA (4/5)` …            expected [] to have a length of 4
  Tests  5 failed | 1 passed (6)
```

Ô còn xanh là *"đối chứng dương: bài hôm nay THẬT SỰ đã có 6 testcase"* — đúng,
nó đo một thứ khác (phép `update` có ăn không).

### PC-3 — migration lùi được

```
TRUOC KHI LUI : [ 'passed', 'total' ]
SAU KHI LUI   : []                      ← ALTER TABLE … DROP COLUMN passed, total
                                          + xoá dòng mới nhất trong drizzle.__drizzle_migrations
=== ap lai ===  migrations applied successfully!
SAU KHI AP LAI: passed  ARRAY   '{}'::text[]
                total   integer 0
```

Lùi rồi áp lại cho ra đúng hai cột với đúng mặc định.

### Đối chứng NẰM TRONG bộ ô

`AC-2 > đối chứng dương: bài hôm nay THẬT SỰ đã có 6 testcase` là một ô thường
trực, không phải một lượt chạy tay: không có nó, một `update` im lặng không ăn
(sai `where`, sai tên cột) sẽ làm ô "vẫn 4/5" **xanh vì bài chưa hề đổi** — tức
một ô đo đúng thứ nó định đo lại đọc ra y hệt một ô không đo gì.

### Khôi phục

`git diff --stat -- submit.ts submissions.ts` **trống** sau cả hai lần phá.

---

## 5. Ô nghiệm thu

| Ô | Kết quả |
|---|---|
| Nộp 5 testcase, qua 4 ⇒ đọc lại từ DB đúng 4 id + `total` 5 | ✅ |
| Sửa bài thêm testcase ⇒ lượt cũ vẫn `4/5`, không thành `4/6` | ✅ |
| Migration áp được lên Postgres dev **và lùi lại được** | ✅ (PC-3) |
| Ô khẳng định hình dạng phản hồi đi qua HTTP thật | ✅ `fetchRequestHandler`, POST + GET, đọc `response.text()` thô |

File ô: `apps/web/src/server/problems/submission-grade.integration.test.ts` (6 ô).

**`claimed.objectivesMet` trong fixture CỐ Ý để rỗng** — đó là phần đo chính, không
phải lười dựng dữ liệu: một lượt khai *không qua testcase nào* mà vẫn đọc ra 4 id
là bằng chứng trực tiếp rằng đường cũ (`passed` lấy từ lời khai) đã đứt.

## 6. Phép kiểm đã chạy

```
tsc --noEmit                                   EXIT 0
eslint src/server/problems src/server/db/       EXIT 0
vitest run src/server/problems --maxWorkers=3   8 files, 101 tests passed   EXIT 0
next build                                      EXIT 0
```

`101 tests passed` đọc từ dòng `Tests`, không chỉ từ mã thoát — vitest thoát 0 khi
mọi ô bị skip.

---

## 7. Chỗ hợp đồng của lead còn thiếu

**(a) `ProblemSubmission` lệch `Submission`.** `core/problem.ts` § `Submission`
KHAI `passed` + `total`; `k8s/problem.ts` § `ProblemSubmission` — kiểu mà tầng web
thật sự đi qua dây — thì KHÔNG. Hai kiểu mô tả cùng một thứ và đã lệch. Lane này
không sở hữu `packages/games` nên mở rộng tại biên web
(`ProblemSubmissionWithGrade` ở `server/problems/dto.ts`) thay vì sửa hợp đồng sau
lưng lead. **Đề xuất:** thêm `passed`/`total` vào `ProblemSubmission` rồi bỏ kiểu
mở rộng ở web.

**(b) Lịch sử không phân biệt được ba nguyên nhân của `CE`.** Với hai cột,
`total === 0` đọc ra `CE` — đúng cho một lượt không chấm được, nhưng CŨNG đúng cho
một dòng ghi trước 18.C (mặc định migration) và cho một bài chưa có testcase nào.
Ba nguyên nhân, một biểu hiện. `failedReason` thì không lưu được (nó là câu tiếng
Việt, không phải dữ liệu), nên `gradeFromSubmission` trả một câu nói đúng cái nó
biết — *"Lượt này không chấm được, và lịch sử không lưu lý do."* Phân biệt được ba
nguyên nhân thì cần một cột thứ ba (`verdict` hoặc `graded_at`), và brief của lane
này ⛔ không thêm cột. **Cần quyết định của lead.**

**(c) `ProblemVerdict` ba nhánh cho bốn trạng thái thật.** Khe cũ mà
`verdict-view.ts` đã ghi (đạt · chưa đạt · không chạy được · chạy được nhưng không
xác minh được) **vẫn còn**, nhưng đã bớt cấp bách: máy chủ nay cầm tập `passed` của
chính nó, nên nhánh `khong-khop` không còn buộc phải in một lời khai đã trượt.

**(d) Cổng seed của §18.G chưa có.** `Submission.seed` ghi rõ: với bài
`seedable: false`, máy chủ phải KIỂM rằng seed gửi lên đúng bằng seed bài quy định.
Hôm nay `submit.ts` nhận `log.seed` không điều kiện — đúng cho việc chấm, nhưng
"mang theo số đã dùng" sẽ thành "người nộp tự chọn thế giới đầu dễ nhất" khi chế
độ thi mở. Bảng `problems` cũng chưa có cột `seedable`. **Không thuộc lane này.**

**(e) Cột `objectives` vẫn là nguồn của `Testcase[]`.** Món nợ `testcases.ts` đã
ghi tên: bảng `problems` chưa có cột `testcases` riêng. Lane này không mở rộng nó —
`problemTestcases(problem.objectives)` vẫn là biên đọc duy nhất.

---

## 8. File đã chạm

```
apps/web/src/server/db/schema.ts                                  (2 cột + chú thích)
apps/web/drizzle/0014_spotty_hiroim.sql                           (mới)
apps/web/drizzle/meta/0014_snapshot.json                          (mới)
apps/web/drizzle/meta/_journal.json
apps/web/src/server/problems/submit.ts                            (gradeProblemRun)
apps/web/src/server/problems/dto.ts                               (ProblemSubmissionWithGrade)
apps/web/src/server/problems/verdict-view.ts                      (gradeFromSubmission)
apps/web/src/server/problems/submissions.ts                       (kiểu items)
apps/web/src/server/problems/submission-grade.integration.test.ts (mới, 6 ô)
```

KHÔNG chạm: `components/k8s-arena/**`, `app/(session)/problems/**`,
`packages/games/**`, `app/author/problems/**`.

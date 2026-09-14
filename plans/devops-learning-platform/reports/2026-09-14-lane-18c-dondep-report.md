# Lane 18.C dọn dẹp, 2026-09-14

Nhánh `feat/p18-oj-exam`. Ba commit đã push: `06fa1b5`, `f659a6e`, `58d1a71`.

| Món | Trạng thái |
|---|---|
| 1. `verdict-view.ts` đặt sai tầng | **LÀM MỘT NỬA.** File mới đã có ở `packages/games/src/core/verdict-view.ts`; chưa rewire, chưa xoá bản cũ. Chờ lead mở barrel. |
| 2. `ProblemSubmission` thiếu `passed`/`total` | XONG |
| 3. `CE` gộp ba nguyên nhân | XONG |

## Món 1: vì sao dừng ở một nửa, không phải vì hết lượt

Barrel là **cửa duy nhất** vào `packages/games`. `package.json` khai đúng một
subpath (`"." -> ./src/index.ts`), nên `apps/web` không deep-import được. Tiền lệ
đã ghi sẵn trong repo: `apps/web/src/components/games/shared/scene-props.ts:32`
nói thẳng *"import `@devops-platform/games/src/git/contract.ts` bị `exports` chặn"*.

Nghĩa là: chuyển file xuống mà barrel chưa mở thì `tsc` và `next build` đỏ ngay.
Lead chốt ba bước để không bước nào để cây đỏ, và tôi mới xong bước 1.

Lời khai của lane máy chủ đã được kiểm chứ không tin suông: `verdict-view.ts` có
đúng MỘT dòng import, từ `@devops-platform/games`. Không chạm `apps/web`, không
`node:*`, không React. Đẩy xuống được nguyên khối, và tôi `cp` nguyên byte rồi
chỉ vá header, nên thân file không lệch một ký tự.

### Dòng export lead cần thêm vào `packages/games/src/index.ts`

```ts
export type { FailedTestcaseView, VerdictView } from './core/verdict-view.ts';
export {
  compileErrorReason,
  gradeFromSubmission,
  gradeOf,
  toVerdictView,
  verdictFromVerify,
} from './core/verdict-view.ts';
```

### Bước 3 còn lại (chưa làm)

1. `apps/web/src/components/k8s-arena/use-problem-submit.ts` đổi sang import từ
   `@devops-platform/games` (nó là file `'use client'` duy nhất đang import giá
   trị từ `apps/web/src/server/`).
2. Ba chỗ gọi còn lại cũng phải đổi, **đừng quên chúng**:
   `apps/web/src/server/problems/submit.ts` (`gradeOf`),
   `apps/web/src/app/(session)/problems/[code]/problem-verdict.tsx` (`VerdictView`),
   `apps/web/src/server/problems/verdict-view.test.ts`,
   `apps/web/src/server/problems/submission-grade.integration.test.ts`
   (`gradeFromSubmission`).
3. Xoá `apps/web/src/server/problems/verdict-view.ts`.
4. `verdict-view.test.ts` **ở lại `apps/web`**: nó import `problemTestcases` /
   `toTestcaseTeasers` từ `./testcases` của `apps/web`, nên không đi theo module
   xuống `packages/games` được nếu không kéo theo hai helper đó.
5. `next build`, rồi grep lại điều kiện nghiệm thu.

## Món 2

`ProblemSubmission` ở `packages/games/src/k8s/problem.ts` nay khai `passed`/`total`;
`ProblemSubmissionWithGrade` ở `dto.ts` đã bị gỡ, ba chỗ dùng đổi sang
`ProblemSubmission`. Chú thích của `total` mang nguyên lý do No-Derived-Fields
không áp, và ghi thêm bẫy `0` là mặc định của cột trước 18.C.

## Món 3

`submissionVerdictLabel` ở
`apps/web/src/app/(session)/problems/[code]/submission-verdict.ts`. Nó vẫn suy
verdict **qua `problemVerdictOf`** (giữ kỷ luật §18.C.3), chỉ dịch riêng nhánh
`CE` thành nhãn `catalog.problem.subs-verdict-ungraded` = *"Chưa chấm theo
testcase"*. Verdict vào bảng lịch sử dưới dạng **cột riêng**, không gộp vào cột
`Kết quả`: `solved` đếm theo mục tiêu bắt buộc, verdict đếm theo mọi testcase.

### Khe CÒN LẠI, không vá được trong lane này

Một lượt `CE` **thật** được `submit.ts` ghi xuống với `passed = []` và
`total = <số testcase>`, tức `total > 0`. Đọc lại, `problemVerdictOf(0, 5)` trả
`WA`, nên dòng đó hiện ra `WA (0/5)` chứ không phải `CE`. Phân biệt được cần một
cột thứ ba (lý do hỏng), và `failedReason` là một câu tiếng Việt chứ không phải
dữ liệu nên không lưu thẳng được. **Đừng vá bằng cách đoán từ
`passed.length === 0`**: một lượt `WA (0/5)` thật cũng có `passed` rỗng.

## Số đo

| Phép đo | Trước | Sau |
|---|---|---|
| `packages/games` test | 1291 / 60 file | **1291 / 60 file** |
| `packages/copy` test | . | 71 / 5 file xanh |
| `apps/web` typecheck | . | exit 0 |
| `packages/games` typecheck + lint | . | exit 0 |

### Đối chứng dương của ô nghiệm thu món 3

Trả lại nhánh cũ (`return t('catalog.problem.verdict-ce')` cho `total <= 0`) thì
**đỏ đúng 4 ô, đúng tên**, tất cả nằm trong nhóm AC:

```
× không phải nhãn CE
× không chứa chuỗi CE ở bất kỳ đâu trong nhãn
× là nhãn riêng nghĩa là chưa chấm theo testcase
× total âm cũng đi chung một nhánh
Test Files  1 failed | 183 passed (184)
     Tests  4 failed | 2183 passed (2187)
```

Ba ô của nhóm `hai nhánh còn lại` vẫn xanh, đúng như mong đợi: chúng không đi qua
nhánh `CE`. Khôi phục xong `diff` trống (`DIFF_TRONG=yes`).

## Ba thứ đo được, nên ghi lại

**1. `pnpm --filter <pkg> test -- <pattern>` không lọc gì.** `--` đi tới vitest
thành một pattern literal, nên lệnh chạy **toàn bộ** suite web (~90s) thay vì một
file, và `--maxWorkers=3` cũng bị nuốt cùng đường đó. Lượt chạy không có
`--maxWorkers` báo `10 errors` với 174 file; hai lượt sau (có ép worker) ra
184 file sạch. Tức 10 lỗi đó là **quá tải khi chạy song song đầy đủ**, không phải
hồi quy. Muốn lọc thì đừng đi qua `pnpm run ... --`.

**2. Cổng rule-of-three của `packages/copy` gom theo DẤU CHẤM, nên nó mù với tên
phẳng.** `groupBySiblingPrefix` cắt khoá bằng `key.split('.')` và lấy `parts
.slice(0, -1)` làm tiền tố, nên mọi khoá `catalog.problem.*` nằm chung MỘT nhóm
đã lớn hơn ba. Hệ quả: dòng `'catalog.problem.verdict'` trong
`catalogIntentionalThree` hiện **không làm gì cả**. Nó không miễn trừ nhóm nào
(nhóm `catalog.problem` đâu có ba thành viên), và vế chống-ôi ở dòng 233 dùng
`startsWith(`${prefix}.`)` **kèm dấu chấm**, trong khi các khoá thật viết
`verdict-ac` bằng **gạch nối**, nên nó cũng không bị báo là ôi. Một miễn trừ
không miễn trừ gì và không ai biết. Tôi không sửa (ngoài lane, và
`packages/copy/src/scan.ts` không thuộc quyền ghi của tôi), nhưng nó đáng một
issue riêng.

**3. Tôi tự dẫm vào cú pháp shell.** Lượt commit đầu tôi dùng here-string của
PowerShell (`@'...'@`) trong **Bash**, nên ký tự `@` lọt vào làm dòng tiêu đề của
cả hai commit. Chưa push nên đã `reset --mixed` và commit lại bằng `-F -` với
heredoc. Ghi ra vì hai shell dùng chung một phiên rất dễ lẫn, và commit hỏng kiểu
này **không có cổng nào bắt**.

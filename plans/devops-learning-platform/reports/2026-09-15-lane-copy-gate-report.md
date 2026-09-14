# Lane `packages/copy`: cổng chống rule-of-three, 2026-09-15

Nhánh `feat/p18-oj-exam`. Một commit: `2286706`. Nợ ở `phase-18.md` §0.3b.

| Món | Trạng thái |
|---|---|
| Vế chống-ôi mù với tên khoá phẳng gạch-nối | **XONG** |
| Dòng `'catalog.problem.verdict'` vô tác dụng | **XOÁ** (vế 2), lý do bên dưới |
| Đối chứng dương, chạy thật | **XONG**, output dán nguyên văn |
| `groupBySiblingPrefix` cắt theo dấu chấm | **KHÔNG ĐỔI** có chủ ý, kèm số đo |

## Đã sửa gì

`packages/copy/src/scan.ts`. Vế chống-ôi hỏi `k.startsWith(prefix + '.')`, tức
bắt buộc một dấu chấm. Thay bằng `isDescendantKey(key, prefix)`, nhận cả `.`
lẫn `-` qua một `KEY_SEPARATORS` khai tường minh:

```ts
function isDescendantKey(key: string, prefix: string): boolean {
  return (
    key.length > prefix.length + 1 &&
    key.startsWith(prefix) &&
    KEY_SEPARATORS.has(key[prefix.length] as string)
  );
}
```

Cộng một `it` mới trong `scan.control.test.ts` (doctrine của file: mỗi bộ dò có
đối chứng riêng), và một khối chú thích trên `groupBySiblingPrefix` ghi lại số
đo ở §"Thứ tôi KHÔNG làm" để lượt sau khỏi đo lại.

## Đối chứng ÂM: cổng cũ trả về RỖNG

Test mới chạy **trước** khi vá `scan.ts`:

```
FAIL src/scan.control.test.ts > đối chứng · scanThree
     > miễn trừ trỏ vào nhóm đặt tên PHẲNG cũng phải ĐỎ, không chỉ tên có dấu chấm
AssertionError: expected [] to have a length of 1 but got +0
 Tests  1 failed | 32 passed (33)
```

`expected []` là điểm chính: cổng cũ không trả về vi phạm nào cả, đúng như
§0.3b mô tả. Sau khi vá: `Tests 33 passed (33)`.

## Cổng THẬT đỏ đúng một dòng, đúng tên

Chạy T3 trên 11 surface thật, sau khi vá, **trước** khi xoá gì:

```
FAIL src/copy.contract.test.ts > T3 · đúng ba > không surface nào có nhóm ba chưa khai lý do
+ [
+   "surfaces/catalog.ts :: catalog.problem.verdict :: stale-intentional-three :: xoá dòng này, nhóm nó miễn trừ không còn là ba khoá anh em",
+ ]
```

Đúng một offender, đúng cái dòng mà §0.3b nói là không cổng nào nói ra.

## Đối chứng DƯƠNG: gỡ một miễn trừ đang sống

Gỡ `common.difficulty` khỏi `surfaces/common.ts` (dòng miễn trừ DUY NHẤT của
surface đó, đang có tác dụng thật):

```
FAIL src/copy.contract.test.ts > T3 · đúng ba > không surface nào có nhóm ba chưa khai lý do
+ [
+   "surfaces/common.ts :: common.difficulty :: three-siblings :: đúng 3 khoá anh em (beginner, intermediate, advanced) mà không khai trong intentionalThree",
+ ]
```

Đỏ **đúng tên nhóm đó** và liệt kê đúng ba thành viên, không đỏ chung chung.
Khôi phục bằng `git checkout -- packages/copy/src/surfaces/common.ts`, rồi
`git diff -- packages/copy/src/surfaces/common.ts` **trống**, `git status
--short` cho file đó **trống**. Commit `2286706` không chứa `common.ts`.

## Dòng `'catalog.problem.verdict'`: chọn vế XOÁ

Vế 1 ("thật sự miễn trừ một nhóm") **không đạt được từ trong lane này**, và đó
là một phép đo chứ không phải một lời từ chối:

- Tiền tố `catalog.problem.verdict` có **5** khoá con đặt phẳng (`ac`, `wa`,
  `ce`, `region`, `unnamed`), **8** nếu tính cả ba khoá `-note`. Không độ mịn
  nào của phép gom biến 5 hay 8 thành 3. Đo trên dữ liệu thật, không suy luận.
- Đường duy nhất làm nó sống lại là **đặt lồng** ba nhãn kia thành
  `catalog.problem.verdict.ac/.wa/.ce`, đúng quy ước đã ghi ở đầu bảng miễn trừ
  của `surfaces/shell.ts` và `surfaces/me.ts`. Việc đó phải sửa chỗ gọi trong
  `apps/web/src/app/(session)/problems/[code]/` (`submission-verdict.ts`,
  `problem-verdict.tsx`, cộng một file test), **ngoài ranh giới sở hữu** của
  lane này, và đúng vùng lead đang sửa dở.

Nên dòng đó bị xoá, và `surfaces/catalog.ts` mang một khối chú thích giải thích
vì sao chỗ đó trống, trỏ về báo cáo này. **Lý do cũ giữ nguyên văn ở đây để chép
lại khi ai đó đặt lồng ba nhãn verdict:**

```ts
  'catalog.problem.verdict':
    '2026-09-14: đúng ba verdict tồn tại trong PROBLEM_VERDICTS tại packages/games/src/core/problem.ts (AC, WA, CE). Hợp đồng nói thẳng vì sao KHÔNG có TLE/RE/MLE: game chạy trên một thế giới mô phỏng trong trình duyệt, không có tiến trình để hết giờ và không có bộ nhớ để tràn. Nhãn thứ tư nào cũng phải sửa union trước, và lúc đó nhóm này thôi là ba.',
```

⚠ Nếu lead đặt lồng mà **quên** chép lại dòng này, T3 sẽ đỏ với
`catalog.problem.verdict :: three-siblings`. Đó là cổng làm đúng việc, không
phải hồi quy.

## Thứ tôi KHÔNG làm, và vì sao

**Không đổi `groupBySiblingPrefix` cho cắt ở gạch nối.** Tiêu đề việc gọi cổng
là "mù với tên khoá phẳng"; nửa mù đó là THẬT, nhưng vá nó là một quyết định về
chính sách với giá đo được, không phải một bản vá. Đo ngày 2026-09-15 trên cả
11 surface (script dùng một lần, không commit):

| Phương án | Nhóm ba MỚI phải khai lý do | Nhóm ba MẤT |
|---|---|---|
| A. Cắt ở dấu phân cách **cuối cùng** (chấm hoặc gạch) | ~40 | **6** |
| B. Gom ở **mọi** ranh giới phân cách | 47 | 1 (`admin.role`) |
| C. Giữ nhóm theo dấu chấm + bóc **một** tầng gạch nối | 27 | 0 |

- **A là hồi quy thẳng.** `error.authz.not-owner` rơi vào nhóm
  `error.authz.not`, nên sáu nhóm ba đang được gác biến mất (`error.authz`,
  `me.labs.status`, `catalog.status`, `catalog.error-hint`,
  `admin.health.metric`, `me.terminal-theme`) và sáu dòng lý do viết công phu
  cho chúng thành ôi. Mất vùng phủ, không phải thêm.
- **C không mất gì**, nhưng 27 nhóm mới phần lớn **không phải một phân loại ba**
  mà là ba VAI TRÒ văn bản của cùng một khối: `admin.users.search` = label,
  placeholder, submit; `auth.register` = title, description, submit;
  `admin.classes.remove` = title, body, confirm. Một bảng miễn trừ dài thêm 27
  dòng như vậy đúng là nghĩa địa mà vế chống-ôi sinh ra để chặn.
- Repo đã có **cách vá khác đang chạy**: quy ước "nhóm ba THẬT thì đặt lồng",
  ghi ở `surfaces/shell.ts:161` và `surfaces/me.ts:349`, lane 16.C2 dựng ra ở
  `92804b7`. Đổi độ mịn sẽ vô hiệu hoá quy ước đó **và** phạt ngược những khoá
  vốn được đặt phẳng chính vì chúng không phải nhóm ba.

Rủi ro còn lại, nói thẳng: **một lane đặt tên phẳng cho một nhóm ba thật vẫn đi
qua T3 vô hình.** Quy ước là thứ duy nhất chặn, và quy ước thì review mới bắt
được. Quyết định "chịu rủi ro đó" hay "trả 27 dòng lý do" là của lead, không
phải của lane; số đo ở trên là để quyết mà không phải đo lại.

Hai điểm mù nhỏ hơn, cố ý để nguyên vì chúng nằm ngoài §0.3b:

1. Vế chống-ôi vẫn còn guard `some(k => isDescendantKey(k, prefix))`. Một dòng
   miễn trừ trỏ vào tiền tố **không tồn tại trong surface** vẫn im lặng. Hiện
   không có dòng nào như vậy (đã đo), nên bỏ guard không đổi gì hôm nay.
2. `catalog.quiz.verdict-pass/-fail` cũng đặt phẳng, nhưng là hai chứ không ba,
   nên không phải việc của cổng này.

## Phép đo cuối, số cụ thể

```
pnpm --filter @devops-platform/copy typecheck   -> tsc --noEmit, TYPECHECK_EXIT=0
pnpm --filter @devops-platform/copy lint        -> eslint .,   LINT_EXIT=0
pnpm --filter @devops-platform/copy test        -> Test Files 5 passed (5)
                                                   Tests 72 passed (72)
```

Trước lượt sửa: 71 test (`scan.control.test.ts` có 32). Sau: **72**, không test
nào skip. Con số đọc từ dòng `Tests N passed`, không đọc mã thoát.

## Kỷ luật cây dùng chung

`git status --short` chạy trước mọi lệnh git. Commit dạng pathspec, đúng ba
file dưới `packages/copy/`. Không `add -A`, không `commit -a`, không
`checkout -b`, không `push`. File của lead ở `apps/web/` và `packages/games/`
không bị chạm; `git status` sau commit cho thấy chúng vẫn dirty nguyên vẹn.

`git checkout -- packages/copy/src/surfaces/common.ts` (bước khôi phục đối
chứng) là khôi phục theo đường dẫn, không đụng `HEAD`.

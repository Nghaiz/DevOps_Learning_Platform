# Lane 18.F — Lớp học

Nhánh `feat/p18-oj-exam`. Bốn commit: `269d5cd`, `557aea9`, `9a931f2` (cộng commit báo cáo này).

## 1. Lược đồ đã chọn

Hai bảng, đặt trong `apps/web/src/server/db/schema.ts`, migration
`apps/web/drizzle/0013_watery_baron_zemo.sql` (đã áp lên Postgres dev).

```
classes        id uuid pk · name text · description text null · owner_id text → users.id cascade
               created_at timestamptz(3)
               index (created_at, id)   ·   unique (owner_id, name)

class_members  class_id uuid → classes.id cascade · user_id text → users.id cascade
               joined_at timestamptz(3)
               pk (class_id, user_id)   ·   index (user_id)
```

### Vì sao chủ lớp là một CỘT chứ không phải một dòng thành viên

`class_members` chứa đúng sinh viên; chủ lớp là `classes.owner_id`. Một bảng thành viên mang
cả hai loại người sẽ cần thêm cột `role`, mà cột đó chỉ có một giá trị thật ở mọi dòng còn
lại. Nặng hơn: nó làm câu hỏi "ai được xem bảng điểm lớp này" có **hai** nguồn trả lời
(`owner_id` và một dòng `role = 'teacher'`), và hai nguồn thì sớm muộn lệch nhau.

### Hai chỗ tôi lệch khỏi chữ trong plan, và lý do

| Plan viết | Tôi làm | Lý do |
|---|---|---|
| bảng `class` + `class_member` | `classes` + `class_members` | Cả 26 bảng đang có đều số nhiều (`users`, `problems`, `content_items`, `lab_attempts`). Một bảng số ít sẽ là ngoại lệ duy nhất. Symbol TS xuất ra là `classes` / `classMembers`. |
| (không nói) | `owner_id` dùng `cascade`, không dùng NO ACTION | Xem ngay dưới. |

**`owner_id` cascade là một quyết định, không phải sao chép nhầm.** Tiền lệ gần nhất
(`content_items.author_id`) cố ý NO ACTION, và lý lẽ của nó là: một bài học không chủ vẫn là
nội dung người học đọc được, nên chặn xoá tác giả mới đúng. Lớp học thì ngược lại: mọi điểm
cuối của nó đứng sau `adminProcedure` và lọc theo chủ lớp, nên một lớp không chủ là dữ liệu
**không ai với tới được**, và chặng này chưa có đường chuyển chủ lớp.

Cái giá phải nói ra: nếu về sau có đường chuyển chủ lớp, cascade là chỗ phải xem lại trước
tiên — lúc đó xoá một tài khoản giảng viên sẽ lặng lẽ xoá cả lớp của họ.

Một ràng buộc phụ đã đẩy theo cùng hướng, ghi lại cho người sau: một khoá ngoại NO ACTION trỏ
về `users` bắt buộc phải khai vào `PURGE_HANDLED_BLOCKING_FKS` trong
`apps/web/src/security/test-helpers.ts`, nếu không `purge-completeness.test.ts` đỏ. File đó
ngoài quyền ghi của lane này. Cascade thì không cần khai gì, và
`purge-completeness.test.ts` xanh (đã chạy, xem §4).

## 2. Cột đã CÂN NHẮC RỒI BỎ vì suy ra được

`rules/code-conventions.md` § No Derived Fields. Năm cột, cả năm đều rẻ lúc ghi rồi phải giữ
đồng bộ bằng trigger mãi mãi:

| Cột bị bỏ | Tính từ đâu | Ai tính |
|---|---|---|
| `classes.member_count` | `count(*)` trên `class_members` | `crud.ts` → `memberCountSql` |
| `classes.average_score` | gộp `problem_submissions` theo tập thành viên | `scoreboard.ts` |
| `classes.owner_name` / `owner_email` | join `users` | `crud.ts` → `summaryColumns` |
| `class_members.role` | hằng số; chủ lớp đã là `classes.owner_id` | không tồn tại |
| `class_members.solved_count` / `last_submitted_at` | gộp `problem_submissions` | `scoreboard.ts` |

`classes.member_count` là cái suýt lọt: nó nấp giữa hai cột hợp lệ (`name`, `created_at`) trong
cùng một câu mô tả bảng, đúng hình dạng mà memory dự án ghi nhận đã giết bốn giả định trước.
Có một ô test khẳng định hệ quả quan sát được của việc bỏ nó (`sĩ số là phép ĐẾM, không phải
một cột lưu sẵn`): thêm rồi bỏ một người thì con số lên rồi xuống mà không có bước đồng bộ nào
ở giữa.

Một cột nữa đã cân nhắc và bỏ vì YAGNI chứ không vì suy ra được: `classes.updated_at`. Chặng
này không có đường đổi tên lớp, nên nó sẽ luôn bằng `created_at`.

## 3. AC-F — đo thế nào, và đối chứng dương

> Một sinh viên gọi thẳng điểm cuối bảng điểm lớp bằng tài khoản của mình ⇒ bị từ chối.

Đo ở **hai tầng**, cố ý không gộp:

| File | Tầng | Cái nó chứng minh |
|---|---|---|
| `apps/web/src/server/classes/authz.integration.test.ts` | `createCaller` + Postgres thật | authz và hành vi DB |
| `apps/web/src/server/classes/http-wire.integration.test.ts` | `fetchRequestHandler` + `appRouter` thật | mã HTTP và THÂN phản hồi trình duyệt nhận |

Vế thứ hai tồn tại vì `createCaller` không đi qua `getErrorShape`, nên nó **không bao giờ quan
sát được** mã HTTP hay thân phản hồi — bẫy đã cắn repo này một lần (router xanh trong khi HTTP
thật trả 500) và đã được ghi ở `security/trpc-error-leak.test.ts`. AC-F nói "gọi thẳng điểm
cuối"; cái "thẳng" đó là HTTP.

Ba khẳng định đáng giá nhất, không phải ba khẳng định dễ nhất:

- Sinh viên **đang ở trong lớp** cũng bị từ chối, không chỉ người ngoài.
- Thân phản hồi 403 không chứa email của **chính người gọi**, tìm trên thân THÔ chứ không trên
  một field đã bóc — nên nó bắt được cả một lượt rò qua `data.stack` hay qua thông điệp lỗi.
- Đối chứng dương chạy **trước**: cùng URL đó, admin nhận 200 và email của sinh viên **có**
  trong thân. Không có vế này thì "sinh viên bị từ chối" không chứng minh được rằng phép từ
  chối đang che một thứ có thật.

### Đối chứng dương đã CHẠY, không phải đã hứa

Tạm đổi `scoreboard: adminProcedure` → `protectedProcedure` trong
`apps/web/src/server/trpc/routers/classes.ts`, chạy lại đúng hai file trên:

```
× sinh viên trong lớp gọi thẳng ⇒ HTTP 403 …   AssertionError: expected 200 to be 403
× sinh viên TRONG lớp gọi thẳng ⇒ FORBIDDEN    promise resolved "{ rows: [ { …(7) } ] }"
× sinh viên NGOÀI lớp gọi thẳng ⇒ FORBIDDEN    promise resolved "{ rows: [ { …(7) } ] }"
× vai trò user bị từ chối ở TẤT CẢ procedure   expected [ 'scoreboard (BAD_REQUEST)' ] to deeply equal []
× vai trò author bị từ chối ở TẤT CẢ procedure
 Test Files  2 failed (2) · Tests  5 failed | 14 passed (19)
```

Rồi khôi phục file từ bản sao và chạy lại: **30/30 xanh**. `git diff` trên file đó trống.

Ô cấu trúc gọi đúng tên `scoreboard` khi nó bị nới — đó là thứ chứng minh cổng ấy không mù.

### Cổng còn sống lâu hơn hai ô trên

`18.F.3 · MỌI procedure của classes.* đứng sau adminProcedure` **duyệt bảng procedure của
router lúc chạy** và đòi từng cái từ chối cả `user` lẫn `author`. Hai ô AC-F chỉ nói về những
procedure người viết test nhớ tới; ô này đỏ với một điểm cuối công khai mà lane sau thêm vào,
kể cả khi người thêm chưa từng đọc file.

Phép đo là **hành vi** (gọi thật rồi xem ném gì), không phải đọc `_def` middleware: một bản
đọc middleware phải tự dựng lại cách tRPC xâu chuỗi, và bản dựng lại đó sẽ trôi ở lần nâng cấp
tRPC kế tiếp. Gọi với input rỗng là cố ý — trong tRPC v11 `.input()` lắp sau middleware của
`adminProcedure`, nên người không phải admin nhận `FORBIDDEN` trước khi Zod kịp chạy; nhờ vậy
cổng không cần biết từng procedure ăn input hình gì. (Đối chứng dương ở trên xác nhận đúng
điều đó: khi hạ xuống `protectedProcedure`, cùng lượt gọi ra `BAD_REQUEST` chứ không phải
`FORBIDDEN`.)

Ô cấu trúc còn có đối chứng dương riêng: một router tí hon dựng từ chính `createTRPCRouter` +
`protectedProcedure` của `init.ts`, và cổng phải gọi tên nó ra.

## 4. Kết quả đo

| Phép đo | Kết quả |
|---|---|
| `vitest run src/server/classes` | **30/30 xanh**, 3 file |
| `purge-completeness` + `admin/copy-gate` + `rule-03-strict-input` + `list-cursor-contract` | **28/28 xanh**, 4 file |
| `pnpm --filter @devops-platform/copy test` | **71/71 xanh**, 5 file |
| `pnpm --filter @devops-platform/web lint` | **XANH toàn cục**, 0 lỗi |
| `pnpm --filter @devops-platform/web build` | **XANH**, hai route mới có mặt |
| `pnpm --filter @devops-platform/web typecheck` | 0 lỗi ở file của lane 18.F; còn đỏ vì lane khác |

`next build` in ra đúng hai đường mới, tức chúng thật sự được biên dịch chứ không chỉ tồn tại
trên đĩa:

```
✓ Compiled successfully in 8.4s
├ ƒ /admin/classes
├ ƒ /admin/classes/[classId]
```

Đây là phép đo bắt được thứ typecheck + lint + test đều bỏ lọt (một barrel chạm `node:fs` lọt
vào client component), nên nó chạy sau cùng chứ không thay cho ba phép trên.

⚠ Hai lượt đo đầu tiên của tôi ĐỎ, và nguyên nhân không phải mã của lane này: `packages/games`
lúc đó đang chưa nhất quán vì một lane P18 khác sửa dở (`Export sessionReplayEngine doesn't
exist in target module`, rồi `Problem` mọc thêm `objectives`). Ghi lại vì lane đó vẫn đang
chạy: nếu ai gặp lại hình dạng lỗi ấy thì đọc `git status` trước khi đi tìm trong mã của mình.

### Typecheck: vì sao vẫn đỏ, và vì sao vế của lane này vẫn kết luận được

5 file còn lỗi, tất cả trong `src/app/author/problems/` — một lane khác đang gọi các khoá chữ
`author.problem.*` chưa được ghi vào `packages/copy/src/surfaces/author.ts`. Không file nào
của lane 18.F xuất hiện.

Kết luận đó đứng được vì đây là lỗi **ngữ nghĩa** (TS2345), không phải lỗi cú pháp: `tsc` đã
chạy đủ pha kiểm kiểu trên toàn chương trình, nên file của lane 18.F ĐÃ được kiểm. Một lỗi cú
pháp thì khác hẳn — nó làm `tsc` bỏ luôn pha ngữ nghĩa, và lúc ấy "chỉ thấy lỗi lane khác"
đọc ra thành "mình sạch" là sai.

## 5. Chưa làm / cần người khác

1. **Liên kết điều hướng.** `components/admin/admin-nav.tsx` ngoài quyền ghi của lane, nên
   `/admin/classes` hiện chỉ tới được bằng gõ URL. Cần chủ file đó thêm một mục thứ sáu
   (khoá chữ đã có sẵn: `admin.classes.title`).
2. **Nhãn tiếng Việt cho `targetType: 'class'`** trong `components/admin/audit-row.ts`. Hàm
   `describeAuditTarget` rơi về chuỗi thô, nên ba hành động lớp học
   (`class.create` / `class.addMember` / `class.removeMember`) hiện ra là chữ `class` trong
   bảng nhật ký. Không hỏng, chỉ là một từ tiếng Anh trong giao diện tiếng Việt.
3. **Cổng a11y (axe) trên hai màn mới** — `e2e/routes.ts` và `a11y.spec.ts` ngoài quyền ghi
   của lane. Hai màn dùng lại đúng `AdminSection` / `Table` / `EmptyState` / `ErrorState` /
   `CursorPager` của các màn `/admin` đang qua cổng, và mỗi `<h2>` mới nằm dưới `<h1>` duy
   nhất của `AdminSection` (không dựng `<main>` thứ hai). Nhưng chưa đo.
4. **Phân trang bảng điểm.** `scoreboard` trả cả lớp một lượt; giả định (đã ghi trong
   `scoreboard.ts`) là sĩ số hàng chục. Tới hàng nghìn thì đó là chỗ phải thêm keyset, và
   khoá sắp xếp hiện tại không duy nhất nên nó sẽ phải kèm `user_id` phá hoà.

## 6. Ghi chú cho 18.G (chế độ thi)

- `exam` sẽ trỏ `classId` về `classes.id`. Cân nhắc kỹ `onDelete`: một kỳ thi là **bản ghi
  lịch sử**, nên NO ACTION (chặn xoá lớp khi còn kỳ thi) nhiều khả năng đúng hơn cascade —
  ngược với quyết định của chính bảng `classes`. Nếu chọn NO ACTION thì `exam.class_id` **không**
  cần khai vào `PURGE_HANDLED_BLOCKING_FKS` (nó trỏ về `classes`, không phải một bảng gốc);
  nhưng `exam_attempt.user_id` trỏ về `users` thì có.
- Bảng điểm lớp hiện chỉ đọc `problem_submissions`. Chữ trên giao diện đã nói rõ phạm vi đó
  (`admin.classes.scoreboard-description`); khi 18.G thêm bảng điểm theo kỳ thi, đừng đổi hàm
  này thành "điểm tổng kết" mà không sửa câu ấy.
- **Không có endpoint nào cho sinh viên** trong `classes.*`, cố ý. Màn dành cho người học là
  việc của 18.G. Khi thêm, nó phải là một router khác hoặc một procedure lọc cứng theo
  `ctx.user.id` — đừng nới `classes.*`, vì cổng cấu trúc ở §3 sẽ đỏ và nó đỏ đúng.

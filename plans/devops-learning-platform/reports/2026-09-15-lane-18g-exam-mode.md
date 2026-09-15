# Lane 18.G — chế độ thi, cộng phần còn lại của 18.D và các món nợ

**Ngày:** 2026-09-15 · **Nhánh:** `feat/p18-oj-exam` · **Commit đầu:** `7d8f6a9` · **cuối:** `7bf45a3`

Một luồng tuần tự, không fan-out. Phạm vi do chủ dự án chốt đầu phiên: đóng nốt
18.D + nợ carryover, rồi làm 18.G.

---

## 0. Bảng rà nợ của các lane trước đã LẠC HẬU

Trước khi làm gì, tôi kiểm năm món nợ mà báo cáo 18.F và plan §0.4 ghi tên. **Bốn
trong năm đã có người đóng rồi:**

| Món nợ theo báo cáo | Đo 2026-09-15 |
|---|---|
| `admin-nav.tsx` thiếu `/admin/classes` | **Đã có** (dòng 41) |
| `audit-row.ts` hiện chữ `class` thô | **Đã có** nhánh `admin.audit-target.class` |
| Cổng a11y chưa phủ màn lớp học | **Đã có** (`e2e/routes.ts:115`) |
| Client/server lệch nghĩa ở cổng xuất bản | **Đã gỡ** `some(o => o.required)` |
| `problem-labels.ts` trỏ `PERSISTABLE_GAMES` đã xoá | **Còn thật** |

Đây đúng hình dạng `rules/debt-lists-quote-stale-docs.md`: số dòng đúng, nội dung
đã sai. Nếu tôi giao việc theo bảng đó thì bốn phần năm công sức rơi vào chỗ
không có việc.

Cũng theo cách đó, ba mục 18.D mà plan liệt kê là "còn lại" hoá ra đã xong:
**D.3** (`problems.state` + `publish-check.tsx` có badge/xuất bản/lưu trữ/xoá),
**D.4** (`json-transfer.tsx` + `problem-json.ts`), **D.7** (`PROBLEMS_SEED` 10
bài, seeder tự đếm lại). Chỉ **D.5** là chưa.

---

## 1. Nhãn chủ đề đa-game (món nợ còn lại thật)

`7d8f6a9`, `cd90094`.

Từ migration 0015 kho lưu chở được bài của mọi game, nên `/problems` nhận được
một bài Git mang chủ đề `branching` , mà `PROBLEM_TOPIC_LABELS` (chỉ K8s) tra ra
`undefined`. React vẽ `undefined` thành **chỗ trống**: một `Badge` rỗng, không
lỗi, không log, không test nào đỏ.

Phép tra đúng hơn (qua `PROBLEM_PLUGINS`) bị loại vì có số đo: PR #124 cho thấy
một chunk 369.938 B chứa engine git nằm ở 7/38 route, 5 trong 7 là route
`problems`, và nó đẩy `/games/k8s/page` vượt trần `bundle:check`. Nên
`GIT_PROBLEM_TOPICS` tách ra module lá `git/problem-topics.ts`, và
`problem-topic-labels.ts` tra theo `gameId` từ dữ liệu lá.

**Ràng buộc bundle không mất, nó thành một ô gác** đi theo đồ thị nhập tương đối
và đỏ nếu chạm module engine nào. Xem §6 về việc ô đó phải đổi nhà.

**Còn hở, đã ghi tên:** `problems-toolbar.tsx` vẫn liệt kê chín chủ đề K8s, nên
bài Git hiện nhãn đúng trong bảng nhưng chưa lọc theo chủ đề được. Đó là một
quyết định giao diện (gộp mười bảy chủ đề vào một danh sách phẳng đổi hẳn trải
nghiệm lọc), không phải một phép tra , chưa hỏi chủ dự án.

---

## 2. §18.D.5 — xem trước theo game

`6f53f0d`.

`arena-preview.tsx` chốt cứng `/games/k8s?problem=`. Bản hiển nhiên của lượt sửa
là dựng chuỗi `/games/${gameId}?problem=`, và **nó sai theo kiểu im lặng**: đo
2026-09-15, `app/games/git/page.tsx` chỉ đọc `?level=` và game Git là game theo
level, không có chế độ bài OJ. Một link `/games/git?problem=GIT-0001` mở ra một
ván Git bình thường ở level mặc định , không lỗi, không 404, không log , và
người soạn kết luận rằng bài của họ đã xem trước được.

Nên đường vào tra qua một BẢNG khai tường minh, và game chưa có đường vào thì
nói thẳng lý do thay vì hiện một nút.

Nối Git vào đây đòi một chế độ chơi mới trong `GitGame` (nạp bài theo mã, dựng
thế giới từ `WorldSpec` của bài, chấm theo testcase) , tức 18.C làm lại cho
engine Git. Ngoài phạm vi D.5.

**Ô gác:** mỗi dòng trong bảng là một LỜI KHAI rằng route đó đọc `?problem=`, và
`tsc` không kiểm được lời khai. Ô test mở chính `page.tsx` của route được khai và
đòi thấy `params.problem`. Đối chứng dương: thêm dòng `git: '/games/git'` làm
cổng đỏ kèm câu `/games/git phải đọc params.problem`.

---

## 3. §18.G — chế độ thi

### 3.1 Hai quyết định chủ dự án chốt trước khi gõ mã

Plan §18.G ghi `⛔ Đừng dựng cổng số 1 trước khi chốt câu đó`. Hai câu hỏi đã
hỏi và đã chốt:

1. **Cổng seed lúc nộp: phương án (b)** , chỉ gác TRONG một `exam_attempt`.
2. **Sửa `durationMinutes` khi đã có lượt: chụp ảnh vào `exam_attempt`.**

Phương án (a) bị bác có số đo: `arena-session.ts:133` sinh seed NGẪU NHIÊN mỗi
phiên, nên một cổng đòi seed bằng một hằng sẽ từ chối **mọi** lượt nộp K8s ,
xác suất qua là 1 trên 2³¹.

### 3.2 Lược đồ (migration 0016, thuần THÊM)

`c3115d8`. `exams` + `exam_attempts`. Ba thứ CỐ Ý không có cột:

- **`deadline`** = `min(started_at + duration, exams.closes_at)`. Lưu nó thì sửa
  `closes_at` xong là cột lưu sẵn thành sai mà không gì báo.
- **`auto_submitted`** suy từ `submitted_at >= deadline`: nộp tay luôn trước hạn
  (đường ghi từ chối sau hạn), lượt tự nộp thì đúng bằng hạn. Hai ca không chồng.
- **`score`** gộp từ `problem_submissions`.

`exam_attempts.duration_minutes` thì CÓ, và nó không phải trường suy ra mà là
**ảnh chụp** thời lượng lúc mở lượt.

**Một chỗ tôi LỆCH khỏi ghi chú bàn giao 18.F §6**, có lý do đo được: báo cáo đó
đề nghị `exam.class_id` dùng NO ACTION ("kỳ thi là bản ghi lịch sử"). Nhưng
`classes.owner_id` đã cascade từ 18.F, nên xoá một tài khoản giảng viên sẽ
cascade xuống `classes` rồi bị chính NO ACTION đó CHẶN , xoá người dùng thất bại
với một lỗi khoá ngoại thô ở chỗ không ai đoán được. Cả hai khoá ngoại nay
cascade. **Cái giá, ghi thẳng tại chỗ khai:** xoá lớp là xoá luôn điểm thi của
lớp đó, và thứ bù lại là §18.G.7 xuất CSV , đó là lý do thật sự để G.7 tồn tại.

### 3.3 Lõi thuần

`e317411`. Ba module không chạm DB: `clock.ts`, `compose-gate.ts` (§18.G.3),
`attempt-seed.ts` (cổng số 1).

`now` là THAM SỐ, không phải `Date.now()` gọi bên trong , không phải để dễ test
mà vì một hàm đọc đồng hồ bên trong thì mọi ô về "hết giờ" phải ngủ thật, và một
ô ngủ thật sẽ bong tróc dưới tải song song.

Đối chứng dương đã chạy: bỏ vế `closesAt` + cho mốc nộp trả `now` làm đỏ đúng ba
ô gác hai luật đó.

### 3.4 Kho lưu, bảng điểm, CSV

`ba28121`. Chỗ dễ sai nhất và đã gác: **lượt nộp NGOÀI cửa sổ thi không được
tính**. Một sinh viên đã giải `K8S-0001` từ tuần trước, mà phép gộp chỉ lọc theo
`problem_code` thì bài tuần trước rơi thẳng vào bảng điểm , không lỗi, không cảnh
báo, điểm trông hoàn toàn hợp lý.

`startAttempt` dùng `onConflictDoNothing` trên khoá chính gộp rồi đọc lại, không
kiểm-rồi-mới-ghi: giải thưởng cho người thắng cuộc đua kia là một đồng hồ được
đặt lại, tức thêm giờ làm bài.

CSV kèm BOM UTF-8 (AC-9). Cột "Tự nộp" có BA trạng thái , ghi "Không" cho một
lượt chưa khoá là khẳng định họ đã nộp tay trong khi họ đang làm bài.

### 3.5 Router và cổng quyền

`9884738`. `exams.*` (admin-only) và `examSitting.*` (người học) tách hẳn, đúng
dặn dò bàn giao của 18.F. 22 ô integration trên Postgres thật, bốn ô đáng giá
nhất:

- bốn lượt `start` ĐỒNG THỜI ra đúng một `started_at`;
- trạng thái lượt thi KHÔNG chở `seed` ra dây;
- người ngoài lớp nhận NOT_FOUND chứ không FORBIDDEN;
- **đối chứng**: cùng lượt nộp KHÔNG kèm `examId` thì cổng seed không chạm tới ,
  thiếu ô này thì bản gác-vô-điều-kiện (phương án (a) đã bị bác) cũng xanh.

`procedureLeaks` rút lên `security/test-helpers` vì hai ô gác cùng dùng.

### 3.6 Bốn màn hình

`2257231`. AC-7 nằm gọn ở `countdown.ts`: máy chủ cấp một KHOẢNG, client trừ dần
bằng `performance.now()`. Ô gác khẳng định điều đó bằng cách **không cấp cho hàm
một `Date` nào** , một bản dùng `deadline - Date.now()` không lắp vừa chữ ký.

Hai chỗ tôi định ghi nợ rồi sửa thật vì máy chủ đã có đủ dữ liệu:

- trạng thái trong danh sách đọc `closed` của máy chủ. Một lượt hết giờ mà bỏ dở
  có `submittedAt = null`, nên mọi phép suy ở client hiện "Đang làm" cho một bài
  đã đóng.
- **Cổng T4 của `packages/copy` bắt được một thiếu sót thật:** tôi khai chữ cho
  mốc mở/đóng mà biểu mẫu luôn gửi `null`, tức giảng viên không đặt được cửa sổ
  thời gian dù G.2 đòi. Hai ô `datetime-local` vào sau đó.

---

## 4. Điều hướng — và một lỗi đứng im từ P16

Chủ dự án duyệt thêm `/admin/exams` (mục thứ bảy) và `/exams` + `/problems` vào
nav chính.

**`/problems` chưa từng có link vào từ đâu.** `grep` toàn repo ngày 2026-09-15
trả rỗng: trang danh mục bài tập , trụ của cả hệ OJ , chỉ tới được bằng gõ URL,
và đã như thế từ P16.

Cổng `proxy.test.ts` bắt hệ quả ngay: thêm mục nav là nhận trách nhiệm gác, nên
`/problems` + `/exams` vào `PROTECTED_PATHS`. Đó không phải vá một lỗ authz ,
cổng thật vẫn là `redirect` trong Server Component cộng `protectedProcedure` ,
mà là đóng nốt lượt chuyển hướng sớm.

---

## 5. Hai lỗi của chính tôi mà không cổng nhanh nào bắt được

### 5.1 `/exams` thiếu provider tRPC → HTTP 500

`0ec25ce`. `(session)` là một route GROUP, không phải đoạn URL, và nó không có
layout riêng: mỗi nhánh tự cấp `TrpcQueryProvider`. Một thư mục mới thừa hưởng
KHÔNG gì cả.

Trạng thái lúc lỗi còn sống: `tsc` sạch, `eslint` sạch, **2315 ô vitest xanh**,
`next build` xanh, `bundle:check` xanh. Lượt quét axe đầu tiên trả
`/exams , HTTP 500`, và log máy chủ nói `Unable to find tRPC Context`. Lỗi nằm ở
HÌNH DẠNG CÂY REACT lúc chạy, nên không phép kiểm tĩnh nào thấy được.

### 5.2 Ô gác chống-rò-engine đặt sai package

`7bf45a3`. Tôi viết phép dò đồ thị nhập (`node:fs`) trong `packages/games`. Package
đó **cố ý không khai `@types/node`** vì nó chạy trong trình duyệt, nên
`pnpm --filter @devops-platform/games typecheck` đỏ với `TS2591`. Cách duy nhất
làm nó xanh lại là thêm `@types/node` , tức mở đường cho mã engine `import`
`node:fs` mà không cổng nào kêu.

**Tôi vi phạm đúng điều plan §3 đã dặn:** `npx vitest run` XANH trên file đó vì
vitest không kiểm kiểu, và tôi không chạy lại `typecheck` của package sau khi
thêm file. Chỉ `turbo run build` mới lộ ra, và lúc đó nó đã chặn tám task khác
chạy (`Tasks: 18/26`).

Ô gác nay ở `apps/web`, đúng chỗ hậu quả rơi xuống.

---

## 6. Phép đo cuối

| Lệnh | Kết quả |
|---|---|
| `turbo run build lint typecheck test --force` | **`Tasks: 32 successful, 32 total`** |
| `apps/web` vitest | 193 file, **2315 ô xanh** (trước khi thêm ô 18.G) |
| `packages/copy` test | **72/72** |
| `packages/games` test | **1302/1302** |
| `apps/web` a11y e2e, `E2E_REQUIRE_ROLES=1` | **40/40 xanh, 0 skip** |
| `next build` | rc=0, bốn route mới có mặt |
| `pnpm bundle:check` | đạt, 4/4 route terminal chạm xterm, 40 route còn lại KHÔNG |
| `seed-content.mjs` | `10 bài tập (10 published)`, đọc lại khớp |

### Vì sao lượt a11y phải chạy với `E2E_REQUIRE_ROLES=1`

Lượt đầu cho "26 passed, 14 skipped" , và mười bốn ô skip đó là nơi AC-4 sống.
Một suite xanh nhờ skip trông y hệt một suite xanh thật, trong cả bảng tổng kết
lẫn mã thoát. Với một tài khoản `admin` thật và `E2E_REQUIRE_ROLES=1` (biến mọi
lượt skip thành một ô đỏ có tên), con số là **40/40, 0 skip** , trong đó có
`/problems`, `/problems/:code`, `/author/problems/:code` (**AC-4**) và hai màn
mới `/exams`, `/admin/exams` (**AC-8**).

---

## 7. Ô nghiệm thu của chặng

| Ô | Trạng thái |
|---|---|
| AC-1 không hồi quy K8s | **xanh** , cả `typecheck` lẫn `test` của `games` |
| AC-2 toàn cây | **xanh** , `Tasks: 32/32` |
| AC-3 server chấm lại | xanh từ trước (18.C) |
| AC-4 bốn ô e2e của P16 | **xanh** , 40/40 không skip |
| AC-5 Level Builder | **chưa làm** , 18.E ngoài phạm vi đợt này |
| AC-6 phân quyền lớp | xanh từ trước (18.F), và 18.G thêm ô của riêng nó |
| AC-7 đồng hồ thi | **xanh ở tầng đo được**, xem cảnh báo dưới |
| AC-8 a11y | **xanh** trên hai màn mới |
| AC-9 CSV tiếng Việt | **xanh ở tầng đơn vị**, xem cảnh báo dưới |

### ⚠ Hai ô xanh mà phạm vi hẹp hơn chữ trong plan

**AC-7** viết: *"đổi giờ hệ thống máy khách lên 2 tiếng ⇒ đếm ngược không đổi"*.
Thứ đã đo là `remainingFrom` không có tham số nào để đồng hồ hệ thống chui vào,
cộng một `grep` trên `app/(session)/exams/`: ba lần khớp `Date.now()` đều nằm
trong CHÚ THÍCH, còn hai lần đọc đồng hồ lúc chạy
(`exam-sitting-client.tsx:229` và `:244`) đều là `performance.now()`. Điều CHƯA đo là một
lượt chạy thật có đổi giờ máy , Playwright không đổi được giờ hệ thống của máy
chủ đang chạy nó, và giả lập bằng `Date` override sẽ chỉ chứng minh lại đúng thứ
ô đơn vị đã nói. Vế *"đóng tab lúc còn 1 phút, mở lại sau 5 phút"* thì có ô
integration thật (`isAttemptClosed` suy lúc đọc, không có tiến trình nền nào).

**AC-9** viết: *"CSV mở được bằng Excel"*. Thứ đã đo là ba byte đầu đúng
`EF BB BF` và nội dung giữ nguyên dấu. Chưa ai mở nó bằng Excel thật.

---

## 8. Còn lại của P18

- **18.E Level Builder** , chưa bắt đầu. Plan §7 xếp nó là thứ CẮT ĐẦU TIÊN.
- **18.H tài liệu** , `docs/oj-format.md` và `docs/exam-format.md` chưa có.
- **`problems-toolbar.tsx`** lọc chủ đề vẫn chỉ K8s (§1).
- **Cổng seed cho bài không seedable NGOÀI kỳ thi** vẫn hoãn theo chốt
  2026-09-15; trong kỳ thi thì đã gác.

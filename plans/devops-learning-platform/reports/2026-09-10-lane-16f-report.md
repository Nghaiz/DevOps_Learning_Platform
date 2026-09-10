# Lane 16.F — admin

**Ngày:** 2026-09-10 · **Nhánh:** `feat/p16-f-admin` · **Nền:** `feat/p16-frontend-rebuild` @ `92804b7`
**Worktree:** `D:/NCKH/wt-p16-f` · **Sở hữu:** `app/admin/**`, `components/admin/**`, `packages/copy/src/surfaces/admin.ts`

---

## 1. Cổng đo thật

### 1.1 `pnpm -w turbo run build lint typecheck test` — lượt CUỐI, sau khi lead vá `.env`

```
Tasks:    32 successful, 32 total
Cached:   29 cached, 32 total
```

**Đọc dòng `Tasks:` trước khi trích số:** 32/32, không task nào bị bỏ lại sau một task đỏ.

| Gói | Test Files | Tests |
|---|---|---|
| `@devops-platform/web` | 143 passed (143) | **1701 passed (1701)** |
| `@devops-platform/ui` | 34 passed (34) | 858 passed (858) |
| `@devops-platform/games` | 25 passed (25) | 402 passed (402) |
| `@devops-platform/scenario` | 17 passed (17) | 285 passed (285) |
| `@devops-platform/terminal` | 6 passed (6) | 133 passed (133) |
| `@devops-platform/motion` | 4 passed (4) | 110 passed (110) |
| `@devops-platform/copy` | 2 passed (2) | **52 passed (52)** |
| `@devops-platform/shared-types` | 3 passed (3) | 48 passed (48) |

Tổng, không chỉ số đỏ: **0 failed, 0 skipped** ở mọi gói.

`typecheck` chạy riêng trước đó: `Tasks: 16 successful, 16 total`.

### 1.2 Lượt ÁP CHÓT đỏ 121 ô, và nó KHÔNG phải mã của lane

Lượt trước lượt trên cho `Tasks: 29 successful, 31 total`, `@devops-platform/web#test` đỏ
**121 ô trong 23 file**, tổng 1665 (1473 passed, 121 failed, **71 skipped**).

Nguyên nhân: `git worktree add` không mang `.env` và `apps/web/.env` sang (khớp `*.env` ở
`.gitignore:50`), nên worktree của lane thiếu `DATABASE_URL`. Lead phát hiện qua lane 16.G1,
vá hai file vào `D:/NCKH/wt-p16-f/` lúc 23:13, và lượt chạy lại xanh 32/32 mà **không sửa một
dòng mã nào**. Đó là phép đối chứng đủ mạnh: cùng một cây mã, đổi đúng một thứ ngoài mã, kết
quả lật.

Hai điều đáng ghi lại vì chúng sẽ tái diễn ở mọi lane chạy trong worktree:

- **`Tasks: 29/31` nghĩa là HAI task không xanh**, một đỏ và một chưa chạy. Trích số test từ
  lượt đó là trích từ một suite không tồn tại đầy đủ.
- **71 ô lặng lẽ SKIP** kéo tổng từ 1695 xuống 1665. Đọc cột passed/failed mà không đọc TỔNG
  thì lượt đó trông như "gần xanh". Đây đúng là hình dạng
  `green-that-proves-nothing`: mẫu số đổi trong im lặng.

⚠ Tôi **không** tự đo nền `92804b7` trong worktree này, nên không khẳng định phép trừ
1701 trừ nền bằng đúng số ô lane thêm vào. Lane thêm 7 ô (6 ở `copy-gate.test.ts`, 1 ở
`admin-nav.test.ts`) và không xoá ô nào; lead báo nền là 1695. Hai con số đó lệch 1, và tôi
để nguyên chỗ lệch thay vì lấp nó bằng một suy diễn.

### 1.3 Glob của lane, chạy riêng

```
pnpm vitest run src/components/admin src/app/admin
 Test Files  8 passed (8)
      Tests  125 passed (125)
```

### 1.4 `node scripts/check-design-tokens.mjs`

```
✓ đối chứng: bắt đủ 13 mẫu màu cứng ..., không kêu trên 20 mẫu sạch ...
✓ không có màu cứng (#hex / thang màu Tailwind / 0xRRGGBB) — đã quét 546 file trong 4 vùng
```

---

## 2. Bảng commit

| SHA | Nội dung |
|---|---|
| `6bb88fa` | `feat(copy)` bản đồ thông điệp surface `admin.`, 6 cổng T0..T6 xanh |
| `230b1ac` | `refactor(admin)` tám module thuần đi qua `packages/copy`, dấu cung đầu mỗi màn |
| `1c0e718` | `feat(admin)` năm màn client đi qua `packages/copy`, cổng T4 hai chiều |
| *(commit thứ tư)* | `test(admin)` bốn ô test theo kịp bản đồ, và bộ đo tự sửa lỗi của chính nó |

20 file đổi, không file nào ngoài glob sở hữu.

---

## 3. Xong

1. **`packages/copy/src/surfaces/admin.ts`** từ 13 dòng rỗng thành bản đồ đủ năm màn: hơn 130
   khoá, trong đó 11 khoá lỗi là `ErrorEntry` hai nửa theo đúng chỉ dẫn L0 để lại trong chính
   file đó. T0..T6 xanh (52/52).
2. **Mọi chuỗi người dùng đọc của lane đi qua bản đồ.** 13 file nguồn, không còn literal
   tiếng Việt nào (cổng T4 của lane khẳng định điều này, kèm đối chứng dương và đối chứng âm).
3. **`copy-gate.test.ts` gác HAI chiều.** Chiều xuôi theo khuôn của 16.D. Chiều ngược, khoá
   trong bản đồ không có nơi gọi, là thứ brief chỉ ra rằng T4 không bắt được và đã lọt qua
   cả 16.C lẫn 16.D.
4. **Ba chuỗi U+2014 bị xoá khỏi đường ra màn hình**, viết lại chứ không thay bằng ký tự trông
   giống: `health-reading.ts:90`, `:200`, và `:261` (chỗ cuối trả THẲNG U+2014 làm nhãn cho
   series không nhãn).
5. **Dấu cung motif ở đầu mỗi màn quản trị** (`AdminSection`), dùng `arcTrackProps` của
   `@devops-platform/motion/motif` ở cỡ nét mảnh nhất, trong khối `aria-hidden`.
6. **Mọi bảng vào khối `overflow-x-auto` riêng.** Bốn bảng của lane có cột id đầy đủ và tên
   metric Prometheus; ở 390px chúng đẩy cả trang trôi ngang, thứ ô nghiệm thu §7 mục 1 cấm.
7. **Cơ chế con trỏ giữ nguyên.** `lib/cursor-stack.ts` + `CursorPager` không bị chạm; ba
   bảng có phân trang vẫn đi đúng đường cũ.

---

## 4. Quyết định đáng tranh luận

### 4.1 Bộ chọn trả về CÂU, không trả về `CopyRef` (khác 16.C)

Lane 16.C đổi bốn bộ chọn sang `CopyRef` (`{ key, params }`) theo §1.6. Lane này giữ kiểu trả
về `string` và gọi `t()` ngay trong bộ chọn.

Phép đo đứng sau: thứ §1.6 chống là **hàm ghép câu tại chỗ**, vì lúc đó bộ dò chỉ soi được
nhánh mà probe đi vào. Ở lane này mọi nhánh của mọi bộ chọn là một khoá trong bản đồ, kể cả
nhánh nội suy, nên phủ của bộ dò là như nhau ở hai cách. Cái `CopyRef` mua thêm là hoãn dựng
câu tới nơi gọi, và lane này không có nơi nào cần hoãn.

Cái giá thì ngược chiều: `CopyRef` **bỏ** kiểm tham số ở tầng biên dịch (`params` tụt xuống
`Params`), và 16.C phải bù bằng một ô test dựng ra câu cho từng nhánh. Gọi `t()` thẳng giữ
nguyên phép kiểm đó. Đây là chỗ tôi cố ý lệch khỏi tiền lệ, và lý do nằm ở tầng kiểu chứ
không ở tiện nghi.

### 4.2 Ba phép ép kiểu bị bỏ, và đó là một sửa lỗi kèm theo

`describeContentKind`, `describeContentState`, `describeSourceName` cũ tra bảng bằng
`KIND_LABEL[kind as ContentKind]`. Phép ép đó cho `undefined` lúc chạy mà tầng kiểu không
thấy, và hàm rơi vào nhánh `?? kind` một cách tình cờ chứ không theo thiết kế. `t()` chỉ nhận
khoá có thật, nên phép thu hẹp (`isContentKind`, so chuỗi tường minh) phải xảy ra TRƯỚC khi
ghép khoá. Sửa này nằm ngoài yêu cầu của brief; tôi làm vì nó là hệ quả bắt buộc của việc đi
qua `t()`, không phải một lượt dọn tuỳ hứng.

### 4.3 `ROLE_LABEL` bị gỡ export

Bảng đó là bản sao thứ hai của thứ bản đồ đã giữ. Test cũ dùng nó làm nguồn đối chiếu; nay
dùng `describeRole()`. Mất mát thật: một ô test gọi `describeRole` rồi so với `describeRole`
sẽ là phép lặp thừa, nên ô còn lại đo **quan hệ** (câu xác nhận phải chứa cả hai vai trò) chứ
không đo chữ.

### 4.4 `app/admin/layout.tsx` KHÔNG sửa, nhưng NẰM TRONG phạm vi quét

Chú thích đầu file khai nó là cổng vai trò thật của cả nhánh `/admin`, và brief cấm động vào.
Đã không động. Nhưng nó vẫn nằm trong `LANE_DIRS` của `copy-gate.test.ts`: cổng đo chuỗi,
không đo quyền sửa. Một chuỗi người dùng đọc lọt vào file đó vẫn phải đỏ, và cách xử lý đúng
lúc ấy là báo lead chứ không phải nới danh sách quét.

### 4.5 Hai nửa `ErrorEntry` vào hai khe của `ErrorState`, không ghép

`err().what` thành `title`, `err().next` thành `message`. Ghép chúng lại thành một chuỗi ở
nơi gọi là bỏ đúng sự phân biệt mà tầng kiểu vừa ép ra. Ba chỗ **buộc phải** ghép là
`ConfirmDialog`, vì nó chỉ có một khe `error`; chỗ ghép nằm trong ba hàm
`describe*Error` và đó là chỗ duy nhất.

---

## 5. Bẫy đo được trong lượt thi công

### 5.1 Probe của `renderMessages` gọi `fn(NUMBER_PROBE)` TRƯỚC

Một `ErrorEntry` viết `what: p.message` nhận số `7` từ probe, nên `typeof obj['what'] === 'string'`
sai, `renderEntry` trả `null`, và khoá đó rơi vào `RENDERED.failures`. Nghĩa thực tế: **mục ấy
trượt khỏi MỌI cổng giá trị (T1b, T2, T5, T6) trong im lặng** nếu ô T0 "mọi mục đều dựng được"
không tồn tại. Ba mục của lane đã dính (`admin.error.role-other`, `terminate-other`, `archive`)
và được sửa thành nội suy có tiền tố, thứ vừa dựng được vừa nói ra cái gì hỏng.

### 5.2 `hoc@example.com` là một chuỗi mất dấu

Placeholder ô tìm kiếm bị T2 đọc là `học` bị lột dấu. Đổi sang `admin@example.com`.

### 5.3 Regex trích khoá đọc bảng miễn trừ thành khoá chết

`adminIntentionalThree` dùng cùng hình dạng dòng với bản đồ (hai dấu cách, chuỗi `admin.*`,
dấu hai chấm), nên chiều ngược của cổng T4 báo ba TIỀN TỐ nhóm (`admin.role`,
`admin.content-kind`, `admin.health.metric`) là ba khoá chết. Đó là một ô đỏ về **chính bộ
đo**, không phải về sản phẩm. Sửa bằng cách cắt file ở `export const adminIntentionalThree`
trước khi trích.

### 5.4 Nửa `next` là câu riêng, nên chữ hoa làm đỏ hai ô test cũ

`toContain('tải lại')` xanh khi câu cũ viết `... — tải lại danh sách.` giữa câu. Bản mới
tách `next` thành câu riêng mở đầu bằng động từ (`Tải lại danh sách.`), nên phép so phân biệt
hoa thường đỏ. Hai ô đã sửa; ghi lại vì mọi lane chuyển sang `ErrorEntry` sẽ gặp đúng hình
dạng này.

---

## 6. Chưa xong

1. **Chưa đo nền `92804b7` trong worktree này.** Xem §1.2 cho chỗ lệch 1 ô còn để ngỏ.
2. **Chưa có ô đo hình học cho dấu cung ở `AdminSection`.** Cung dùng `arcTrackProps` nên hình
   học do `packages/motion` gác (110/110 xanh), nhưng "cung có thật sự hiện ra ở đầu mỗi màn
   quản trị không" là phán quyết bằng mắt và chưa có phép đo. Nó thuộc lớp ô mà `phase-16.md`
   §3 mục 5 chuyển sang 16.I vì chỉ đo được trong trình duyệt thật.
3. **Chưa đo axe / bàn phím trên năm màn quản trị.** Cả hai nằm ở `e2e/**` (16.I).
4. **`admin-guard.ts` không đổi.** Nó không chứa chuỗi người dùng đọc nào (cổng T4 xuôi xanh
   trên nó), nên không có việc gì để làm.

---

## 7. Thứ KHÔNG tìm thấy, kèm phạm vi đã tìm

- **Không có component nào trong `packages/ui` mang motif ellipse sẵn.** Đã tìm:
  `grep -rn "motion/motif\|arcTrackProps\|ARC_PATH_D\|arcProgressProps" apps/web/src packages/ui/src`
  → đúng một nơi dùng (`components/session/ide-pane.tsx`, ba dòng). `EmptyState` vẫn dùng icon
  `Inbox` của lucide, `ErrorState` vẫn dùng `AlertTriangle`. Cả hai là file của 16.A, ngoài
  glob của lane, nên lane không đổi chúng. Hệ quả: design §3 nói "trạng thái rỗng là vòng
  ellipse hở" nhưng bốn `EmptyState` của lane này vẫn hiện khay rỗng. Muốn đóng thì phải sửa
  `packages/ui/src/empty-state.tsx`, và đó là quyết định ảnh hưởng mọi lane.
- **Không có tiện ích cỡ chữ mới phải đổi tên.** Đã tìm: `grep -n "text-step\|--text-\|@utility" apps/web/src/app/globals.css`
  → thang `clamp()` của §3.2 khai đè lên chính tên Tailwind (`--text-2xl`, `--text-lg`), nên
  `text-2xl` sẵn có đã nhận thang mới. Không có `text-step-*` nào trong `apps/web/src`.
- **Không có cổng nào gác "khoá trong bản đồ không có nơi gọi" trước lane này.** Đã tìm:
  `grep -rln "scanLatinLiteral" apps/web/src` → đúng một file
  (`components/session/copy-gate.test.ts`), và nó chỉ gác chiều xuôi.

---

## 8. File đã chạm, và file cố ý không chạm

**Đã chạm (20):**

```
packages/copy/src/surfaces/admin.ts
apps/web/src/components/admin/{admin-nav,admin-section,confirm-dialog,health-panel}.tsx
apps/web/src/components/admin/{role-change,session-row,content-row,audit-row,health-reading}.ts
apps/web/src/components/admin/{admin-nav,role-change,session-row,health-reading}.test.ts
apps/web/src/components/admin/copy-gate.test.ts                        (mới)
apps/web/src/app/admin/overview-client.tsx
apps/web/src/app/admin/{users/users-client,sessions/sessions-client}.tsx
apps/web/src/app/admin/{content/content-client,audit/audit-client}.tsx
```

**Cố ý KHÔNG chạm:**

| File | Vì sao |
|---|---|
| `app/admin/layout.tsx` | Cổng vai trò thật của cả nhánh `/admin`; brief cấm, và chú thích đầu file giải thích vì sao nó gác ở đúng tầng đó. |
| `app/admin/{page,users/page,sessions/page,content/page,audit/page}.tsx` | Server Component mỏng, không chứa chuỗi người dùng đọc nào. |
| `components/admin/admin-guard.ts`, `app/admin/role-gate.test.ts` | Logic phân quyền thuần, không có chuỗi hiển thị. |
| `components/admin/{audit-row,content-row}.test.ts` | Không ô nào đỏ sau lượt chuyển; sửa chúng là churn. |
| `packages/copy/src/registry.ts` | File khoá của L0; §6.1 cấm lane chạm. |
| `packages/ui/**`, `packages/motion/**` | Ngoài glob; đọc và gọi, không sửa. |
| `lib/cursor-stack.ts`, `CursorPager` | Cơ chế con trỏ là LOGIC, brief cấm thay. |

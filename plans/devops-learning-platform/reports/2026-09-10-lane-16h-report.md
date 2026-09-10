# Lane 16.H — me + settings

**Ngày:** 2026-09-10 · **Nhánh:** `feat/p16-h-me-settings` · **Nền:** `feat/p16-frontend-rebuild` @ `cd6d51a`
**Worktree:** `D:/NCKH/wt-p16-h` · **Sở hữu:** `app/me/**`, `app/settings/**`, `components/me/**`, `packages/copy/src/surfaces/me.ts`

---

## 1. Cổng đo thật

### 1.1 `pnpm -w turbo run build lint typecheck test`

```
Tasks:    32 successful, 32 total
Cached:   24 cached, 32 total
Time:     1m25.659s
```

**Đọc dòng `Tasks:` trước khi trích số:** 32/32, không task nào bị bỏ lại sau một task đỏ.
Lượt này chạy trên cây đã commit đủ ba commit mã.

### 1.2 TỔNG từng gói, không chỉ số đỏ

Lượt `pnpm -w turbo run test` riêng: `Tasks: 15 successful, 15 total`.

| Gói | Test Files | Tests | Nền lead báo |
|---|---|---|---|
| `@devops-platform/web` | 146 passed (146) | **1736 passed (1736)** | 1729 (145 file) |
| `@devops-platform/ui` | 34 passed (34) | 858 passed (858) | 858 |
| `@devops-platform/games` | 25 passed (25) | 402 passed (402) | 402 |
| `@devops-platform/scenario` | 17 passed (17) | 285 passed (285) | 285 |
| `@devops-platform/terminal` | 6 passed (6) | 133 passed (133) | 133 |
| `@devops-platform/motion` | 4 passed (4) | 110 passed (110) | 110 |
| `@devops-platform/copy` | 2 passed (2) | **52 passed (52)** | 52 |
| `@devops-platform/shared-types` | 3 passed (3) | 48 passed (48) | 48 |

**0 failed, 0 skipped ở mọi gói.** Tổng 3624; nền lead báo 3617.

**Phép trừ khớp, và nó khớp theo HAI đường độc lập.** Web tăng đúng **+7 ô** và **+1 file**;
file mới là `components/me/copy-gate.test.ts` và nó chứa đúng 7 ô (5 ở `describe` chiều xuôi,
2 ở chiều ngược). Đường thứ hai: lượt chạy riêng glob của lane cho **60 → 67**, cùng một số 7,
đo trước và sau khi thêm file. Hai phép đo đi từ hai mẫu số khác nhau và ra cùng một hiệu, nên
lane này không âm thầm mất ô nào của nền.

`copy` giữ nguyên 52 ô: 144 khoá mới đi vào các cổng ĐANG CÓ (T0..T6 quét cả bản đồ), không ô
nào được thêm. Đó là điều đúng — thêm một ô riêng cho surface `me.` là dựng một cổng thứ hai
song song với cổng của gói.

### 1.3 Glob của lane, chạy riêng

```
pnpm vitest run src/components/me src/app/me src/app/settings
 Test Files  8 passed (8)
      Tests  67 passed (67)
```

### 1.4 `node scripts/check-design-tokens.mjs`

```
✓ đối chứng: bắt đủ 13 mẫu màu cứng ..., không kêu trên 20 mẫu sạch ...
✓ không có màu cứng (#hex / thang màu Tailwind / 0xRRGGBB) — đã quét 553 file trong 4 vùng,
  4 file được miễn trừ có ghi lý do
```

Nền quét 546 file (số 16.F ghi); lượt này 553. Chênh 7 là số file các lane sau 16.F thêm vào,
trong đó lane này góp 2 (`me-section.tsx`, `copy-gate.test.ts`).

### 1.5 Lượt soi tay theo §6.2 mục 2

Hợp đồng bảo chạy `rg -n '[À-ɏẠ-ỹ]'` trên thư mục của lane và **cấm `grep -iF`** (hai cờ đó gộp
lại trả 0 hit trên tiếng Việt trong im lặng). `grep -P` trên máy này từ chối chạy
(`-P supports only unibyte and UTF-8 locales`), nên lượt soi chạy bằng một script node dùng
đúng lớp ký tự đó, có bóc chú thích:

```
file NGUỒN (bỏ test) quét: 21 · dòng còn dấu ngoài chú thích: 0
file quét kể cả test:      29 · dòng còn dấu ngoài chú thích: 166
```

**166 dòng kia nằm TRỌN trong `*.test.ts`, và đó là miễn trừ có chủ ý.** Một ô khẳng định nhãn
đọc ra là "Đang chạy" chỉ có giá trị khi nó viết THẲNG chuỗi đó; viết
`expect(...).toBe(t('me.session-status.running'))` là so bản đồ với chính nó, xanh với mọi giá
trị kể cả chuỗi rỗng. Cái giá được nói ra ở đầu `copy-gate.test.ts`.

---

## 2. Bảng commit

| SHA | Nội dung |
|---|---|
| `b2af124` | `feat(copy)` bản đồ thông điệp surface `me.`, 144 khoá, bảy nhóm ba đặt lồng |
| `bd4e8b9` | `refactor(me)` bảy module thuần đi qua `packages/copy`, giữ nguyên kiểu trả `string` |
| `7e25893` | `feat(me)` hai màn đi qua `packages/copy` trọn vẹn, cổng T4 hai chiều |
| *(commit này)* | `docs(plan)` chính báo cáo này |

**23 file đổi, không file nào ngoài glob sở hữu.**

---

## 3. Xong, theo từng mục của §16.H

§16.H trong `phase-16.md` là một mục gộp ba lane (`16.F · 16.G · 16.H`) với hai câu ràng buộc,
không phải một danh sách đánh số như 16.B hay 16.D. Bảng dưới đọc theo đúng hai câu đó cộng
ràng buộc của brief.

| Yêu cầu | Trạng thái |
|---|---|
| "Dựng lại theo token và copy mới" | **Xong.** 21 file nguồn, 0 chuỗi người dùng nằm ngoài bản đồ (cổng T4 khẳng định, kèm đối chứng dương và đối chứng âm). Cổng màu trần xanh. |
| "Bảng và phân trang giữ cơ chế con trỏ đang có" | **Xong, KHÔNG chạm.** `lib/cursor-stack.ts`, `CursorPager`, `use-cursor-pages.ts` không đổi một dòng. Bốn danh sách phân trang của lane vẫn đi đúng đường cũ. |
| Chín module logic thuần giữ nguyên, test không bị xoá | **Xong.** Bảy module đổi thân hàm để gọi `t()`; hai module (`use-cursor-pages.ts`, `history-page-notice.ts` phần `shouldShowPager`) không mang chuỗi nào nên không đổi. 0 ô test bị xoá; 6 ô đổi khẳng định vì câu đổi, mỗi ô có chú thích nói vì sao. |
| `ProgressBar` + motif cung dùng, không tự vẽ | **Xong.** `ProgressBar` giữ nguyên vai trò control tiến độ; cung lấy từ `@devops-platform/motion/motif` (`arcTrackProps`), không tự dựng path. Xem §4.3 cho lý do cung KHÔNG mang tiến độ. |
| Component lấy từ `@devops-platform/ui` | **Xong.** Không import `sonner` trực tiếp; lane này không dùng toast nào (ba form báo bằng `Alert` tại chỗ, đúng khuôn cũ). |
| `layout.tsx` × 2 không sửa | **Xong, không chạm.** Xem §4.7. |
| Cổng T4 hai chiều theo khuôn 16.F | **Xong.** 144 khoá, **0 khoá mồ côi**. |

---

## 4. Quyết định đáng tranh luận

### 4.1 Bộ chọn trả về CÂU, theo 16.F chứ không 16.C

Bảy module thuần gọi `t()` trong thân hàm và vẫn trả `string`. Lý lẽ của 16.F §4.1 áp nguyên:
thứ §1.6 chống là hàm GHÉP CÂU tại chỗ (lúc đó bộ dò chỉ soi được nhánh mà probe đi vào), còn ở
đây mọi nhánh của mọi bộ chọn là một khoá trong bản đồ, nên phủ của bộ dò là như nhau ở hai
cách. `CopyRef` đổi lại **bỏ** kiểm tham số ở tầng biên dịch.

Lane này có thêm một lý do mà 16.F không có, và nó là lý do quyết định: **chín module đó là hàm
thuần ĐÃ CÓ TEST, và brief cấm xoá test.** Giữ kiểu trả `string` nghĩa là các khẳng định cũ
chuyển sang câu mới; đổi sang `CopyRef` nghĩa là chuyển chúng sang một hình dạng dữ liệu khác,
tức viết lại phần lớn 60 ô đang xanh để đo một thứ có phủ tương đương.

### 4.2 `describeEndSessionError` đổi kiểu trả về, và đó là sửa một lỗi có thật

Hàm cũ trả `string` ghép sẵn hai vế. Nơi gọi đổ chuỗi đó vào `ErrorState.message` và **không
truyền `title`**, nên khe tiêu đề rơi về mặc định của component: `'Không tải được dữ liệu'`.
Câu đó nói sai hẳn chuyện vừa xảy ra — người dùng vừa bấm "Kết thúc phiên" và màn hình báo
không tải được dữ liệu.

Hàm nay trả `ErrorEntry`; `what` vào `title`, `next` vào `message`. Luật rút ra, ghi trong chính
file: **ghép hai nửa chỉ đúng khi nơi nhận có ĐÚNG MỘT khe.** `ErrorState` có hai, `Alert` có
một — nên hai `SaveError` của `profile-form` và `preferences-form` ghép, còn bốn chỗ dùng
`ErrorState` thì không. Ô test đi theo: nó nay khẳng định TỪNG NỬA thay vì so trên chuỗi ghép,
vì phép so trên chuỗi ghép xanh cả khi một nửa rỗng.

Đây là thay đổi vượt ra ngoài "dựng lại phần nhìn". Tôi làm vì nó là hệ quả bắt buộc của việc đi
qua `ErrorEntry`, không phải một lượt dọn tuỳ hứng.

### 4.3 Cung motif KHÔNG mang tiến độ, dù `arcProgressProps` có sẵn

Thẻ lộ trình trên `/me` là chỗ tiến độ thật sự sống, và một cung quét theo `passedCount/itemCount`
là hình đẹp nhất mà design §3 mời gọi. Tôi không làm, và lý do là một phép đo chứ không phải một
sở thích: thẻ đó đã có `ProgressBar` của `packages/ui`, mang `role="progressbar"` cùng bộ
`aria-valuenow/min/max` và một khối chú thích riêng về `aria-progressbar-name` — tất cả nằm
trong 858 ô đang gác của gói. Thay nó bằng một cung tự dựng nghĩa là **tự viết một control aria
trong glob của lane với phủ test THẤP HƠN thứ nó thay**.

Cung vì vậy là trang trí thuần, nằm trong khối `aria-hidden`, dùng `--border` theo §8.5. Muốn
cung mang tiến độ thì đường đúng là thêm một biến thể cung vào `packages/ui/src/lesson/progress-bar.tsx`,
và đó là quyết định ảnh hưởng mọi lane.

### 4.4 Cung xuất hiện ĐÚNG MỘT LẦN mỗi màn, ba `<h2>` không mang cung

16.F đặt một cung mỗi màn quản trị. Lane này theo cùng nhịp, và từ chối đặt cung ở đầu ba khối
của `/me` cùng ba thẻ của `/settings`. Lý do không phải tiết kiệm: một hình lặp ở đầu mọi khối
là đúng cái nhịp "câu, rồi cú chốt" mà lượt rà văn phong của dự án này gọi tên khi nó xuất hiện
trên slide. Nói ra ở đây thay vì để lane sau đọc sự vắng mặt thành một chỗ bỏ sót.

### 4.5 `metadata.title` vào bản đồ, và mười trang khác thì KHÔNG

Hai `page.tsx` của lane mang `title: 'Của tôi — DevOps Learning Platform'` với một U+2014 nằm
thẳng trong chữ người dùng đọc (thanh tab trình duyệt). §1.7 xếp `<title>` vào bản đồ, nên cả
hai chuyển sang `t()` và dấu phân cách đổi sang dấu chấm giữa.

**Đo được, và báo lại thay vì tự sửa:** trước lượt này `grep "title: '"` trên `app/*/page.tsx`
cho **12 dòng và cả 12 dùng U+2014**; sau lượt này còn **10 dòng, vẫn cả 10 dùng U+2014** (đo
lại sau khi commit). Mười dòng đó thuộc `games`, `labs`, `lessons`, `login`, `paths`,
`playgrounds`, `quiz`, `(session)/problems`, `author/problems`, `games/k8s` — tất cả ngoài glob
của lane này, và cả 16.C, 16.E, 16.F đều đã đi qua chúng mà không đổi. Cổng T1 chỉ quét
`packages/copy/src/**` nên nó không thấy chúng, và sẽ không bao giờ thấy. **Đây là việc cho lead
hoặc 16.I, không phải cho một lane.**

### 4.6 `unit.second` / `unit.minute` mượn từ `common.`, không khai lại

`formatDuration` cũ dựng `"${n} giây"` tại chỗ. `common.ts` của L0 đã có `unit.second`,
`unit.minute`, `unit.hour` với đúng câu đó. Khai lại dưới tiền tố `me.` là bản sao thứ hai của
cùng một câu, và §1.7 nói thẳng: chuỗi dùng ở từ hai surface trở lên thuộc `common.`. Chỉ dạng
ghép `N giờ M phút` ở lại surface của lane, vì `common.` chưa có nó và nó chỉ dùng ở một chỗ.

Hệ quả: bản đồ của lane nhỏ đi 2 khoá, và một lượt sửa chữ "giây" trong tương lai đổi đúng một
chỗ thay vì hai.

### 4.7 `layout.tsx` × 2 KHÔNG sửa, nhưng NẰM TRONG phạm vi quét

Cùng phán quyết 16.F §4.4. Hai file khai rằng auth gác ở `page.tsx` chứ không ở layout, và brief
cấm động vào. Đã không động. Nhưng cả hai vẫn nằm trong `LANE_DIRS` của `copy-gate.test.ts`:
**cổng đo chuỗi, không đo quyền sửa.** Một chuỗi người dùng đọc lọt vào hai file đó vẫn phải đỏ,
và cách xử lý đúng lúc ấy là báo lead chứ không phải nới danh sách quét.

### 4.8 `SHELL_LABEL` / `TERMINAL_THEME_LABEL` đổi từ bảng thành hàm

Hai bảng cũ là `Readonly<Record<..., string>>` export ra ngoài. Nay là bảng KHOÁ nội bộ cộng hai
hàm `shellLabel()` / `terminalThemeLabel()`. Lý do là cùng lý do 4.1: một bảng chuỗi export ra
là một nguồn chữ thứ hai đứng cạnh bản đồ. Ô test cũ dùng `SHELL_LABEL.pwsh` làm nguồn đối chiếu
nay dùng `shellLabel('pwsh')`, tức đối chiếu với chính bản đồ.

**Ba nhãn shell không có dấu tiếng Việt** (`bash`, `zsh`, `PowerShell (pwsh)`), nên cổng T4
KHÔNG bắt được chúng nếu chúng ở lại trong TSX. Đưa chúng vào bản đồ là quyết định đọc theo
§1.7 ("vào bản đồ: chữ hiển thị"), **không phải theo thứ cổng bắt được** — một cổng một chiều
không phải là định nghĩa của luật. Ghi lại vì đây là chỗ dễ trôi nhất ở lượt sửa sau.

### 4.9 `describeRole` thu hẹp TRƯỚC khi ghép khoá, không dùng `as`

`ROLE_LABEL[role] ?? role` cũ là đúng ba phép ép kiểu mà 16.F phải gỡ ở `describeContentKind`.
Bản mới so chuỗi tường minh (`role === 'user' || ...`) trước khi ghép `` t(`me.role.${role}`) ``,
nên một vai trò mới ở `users.role` là lỗi biên dịch chứ không phải `undefined` lúc chạy rơi vào
nhánh `?? role` một cách tình cờ. Mã lạ vẫn hiện NGUYÊN MÃ — đó là hành vi cũ và nó đúng.

---

## 5. Bẫy đo được trong lượt thi công

### 5.1 Năm bẫy brief cảnh báo: bốn tránh được từ đầu, một cắn

| Bẫy | Kết quả |
|---|---|
| Probe `renderMessages` gọi `fn(NUMBER_PROBE)` trước | **Tránh.** Mọi `DynamicError` nội suy vào chuỗi có tiền tố ngay từ bản nháp đầu; không mục nào gán thẳng `what: p.message`. |
| Nửa `next` là câu riêng viết hoa | **Cắn 2 ô**, sửa và ghi chú thích ở cả hai (`session-summary.test.ts`, `preference-notices.test.ts`). |
| T4 báo động giả trên `.ts` thuần | **Tránh.** Áp phép lọc `jsx-text` của 16.E ngay từ khi viết cổng; glob của lane có 9 file `.ts` thuần nên báo động giả là chắc chắn chứ không phải rủi ro. |
| T4 không phân biệt chữ người vận hành | Không phát sinh: lane không có `console.error`/`throw` mang chuỗi nào. |
| `intentionalThree` cùng hình dạng dòng với bản đồ | **Tránh.** Cắt file ở `export const meIntentionalThree` trước khi trích khoá, và thêm một ô khẳng định `keys` KHÔNG chứa bảy tiền tố nhóm — nếu phép cắt hỏng thì ô đó đỏ trước, chứ không phải bảy khoá bị báo chết. |

### 5.2 Hai ký tự cấm nằm trong CHÚ THÍCH, không trong giá trị

Lượt chạy `packages/copy` đầu tiên đỏ 2 dòng: một U+2014 và một `·` thiếu dấu cách hai bên. Cả
hai nằm trong chú thích mô tả *chuỗi cũ đã bị bỏ* — tức tôi trích dẫn đúng thứ mình vừa xoá.
T1a quét NGUỒN kể cả chú thích, và đó là điều đúng (một danh sách loại trừ là chỗ mà thứ cần
chặn đi qua). Cách sửa là **mô tả** ký tự thay vì gõ nó.

### 5.3 Bảy nhóm ba, và cả bảy đặt LỒNG ngay từ đầu

`scanThree` gom khoá theo tiền tố bỏ phân đoạn cuối, nên `me.history.tab-lessons` (phẳng) rơi
vào nhóm `me.history` đông thành viên và **đi qua T3 vô hình**. 16.C2 đã tự phát hiện đúng chỗ
này ở đợt trước và báo lại. Lane này áp từ đầu: cả bảy nhóm đặt lồng
(`me.history.tab.*`, `me.lessons.col.*`, `me.labs.status.*`, `me.role.*`, `me.password.field.*`,
`me.shell.*`, `me.terminal-theme.*`), và mỗi nhóm khai một câu lý do trỏ vào enum hoặc bảng dữ
liệu có thật, không phải một dấu tích.

T3 xanh ngay lượt đầu — nhưng **đó không phải bằng chứng rằng cổng thấy chúng**. Bằng chứng là
đối chứng dương đã có sẵn trong `scan.control.test.ts` của L0; lane này không dựng lại nó.

---

## 6. Chưa xong

1. **Chưa có ô đo hình học cho cung ở `MePageHeader`.** Cung dùng `arcTrackProps` nên hình học do
   `packages/motion` gác (110/110 xanh), nhưng "cung có hiện ra ở đầu mỗi màn không" là phán
   quyết bằng mắt. Thuộc lớp ô mà `phase-16.md` §16.I mục 5 chuyển sang 16.I.
2. **Chưa đo axe / bàn phím / 390px trên `/me` và `/settings`.** Cả ba nằm ở `e2e/**` (16.I). Ba
   bảng đã vào khối `overflow-x-auto` riêng, nhưng "không tràn ngang ở 390px" chưa có phép đo
   nào trong lane này.
3. **Chưa tự đo nền `cd6d51a` trong worktree này.** Lấy con số lead báo (web 1729 / 145 file).
   Phép trừ khớp theo hai đường độc lập (§1.2), nên tôi tin nó, nhưng nói ra rằng tôi không tự
   dựng lại nền.
4. **Mười `page.tsx` khác vẫn mang U+2014 trong `metadata.title`.** Ngoài glob. Xem §4.5.
5. **`EmptyState` vẫn hiện icon `Inbox` của lucide, không phải vòng ellipse hở của design §3.**
   Bốn `EmptyState` của lane đi qua nó. Sửa phải vào `packages/ui/src/empty-state.tsx`, ngoài
   glob, và ảnh hưởng mọi lane. Đây là cùng khoản 16.F đã báo và nó vẫn mở.

---

## 7. Thứ KHÔNG tìm thấy, kèm phạm vi đã tìm

- **Không có cổng nào gác "khoá trong bản đồ không có nơi gọi" ngoài của 16.F.** Đã tìm:
  `grep -rln "scanLatinLiteral" apps/web/src` → bốn file, kể cả file mới của lane này
  (`components/{session,marketing,admin,me}/copy-gate.test.ts`). Trong ba file có trước, chỉ
  `components/admin/` gác hai chiều; `session/` và `marketing/` gác một chiều. File của lane này
  là cổng hai chiều thứ hai trong toàn ứng dụng.
- **Không có component nào của lane import `sonner` trực tiếp, và cũng không dùng toast nào.**
  Đã tìm: `grep -rn "sonner\|useToast" apps/web/src/components/me apps/web/src/app/me apps/web/src/app/settings`
  → 0 hit. Ba form báo kết quả bằng `Alert` tại chỗ, đúng khuôn cũ; không có lượt chuyển nào cần
  làm.
- **Không có nơi nào ngoài lane dùng `SHELL_LABEL` / `TERMINAL_THEME_LABEL`.** Đã tìm trước lượt
  chuyển: 6 hit, tất cả trong `components/me/` (2 ở `preferences-form.tsx`, 2 ở
  `preference-notices.test.ts`, 2 ở chính `preference-notices.ts`). Sau lượt chuyển, cùng lệnh
  `grep -rn "SHELL_LABEL\|TERMINAL_THEME_LABEL" apps/web/src --include=*.ts --include=*.tsx` cho
  **4 hit, cả 4 trong `preference-notices.ts`** và đều là bảng KHOÁ nội bộ (`*_LABEL_KEY`) chứ
  không phải bảng chuỗi export. Đổi hai bảng thành hàm vì vậy không đụng lane nào khác, và
  `typecheck` xanh xác nhận điều đó cho cả `describeSessionShellFallback`, thứ được gọi từ ngoài
  `components/me/`.
- **Không có `intentionalThree` nào sẵn trong surface `me.ts` lúc L0 bàn giao.** File 13 dòng,
  cả `me` lẫn `meIntentionalThree` đều rỗng. Bảy nhóm ba đều là nhóm lane này tạo ra.

---

## 8. Số khoá copy

| Chỉ số | Giá trị |
|---|---|
| Khoá `me.*` thêm vào | **144** |
| Khoá mồ côi (trong bản đồ, không nơi gọi) | **0** |
| Nhóm khai `intentionalThree` | 7 |
| Chuỗi người dùng còn nằm ngoài bản đồ trong glob của lane | **0** |
| File nguồn của lane (bỏ test) còn dấu tiếng Việt ngoài chú thích | **0 / 21** |

Cả bốn số 0 đều do một cổng khẳng định, không do một lượt đọc bằng mắt. Số 144 trích bằng cùng
một regex mà cổng chiều ngược dùng, sau khi cắt ở `export const meIntentionalThree`.

---

## 9. File đã chạm, và file cố ý không chạm

**Đã chạm (23):**

```
packages/copy/src/surfaces/me.ts
apps/web/src/components/me/me-section.tsx                              (mới)
apps/web/src/components/me/copy-gate.test.ts                           (mới)
apps/web/src/components/me/{active-sessions,history-tabs,learning-now}.tsx
apps/web/src/components/me/{profile-form,password-form,preferences-form}.tsx
apps/web/src/components/me/{account-sections,attempt-summary,history-page-notice}.ts
apps/web/src/components/me/{lesson-progress,path-progress,preference-notices,session-summary}.ts
apps/web/src/components/me/{account-sections,attempt-summary,path-progress}.test.ts
apps/web/src/components/me/{preference-notices,session-summary}.test.ts
apps/web/src/app/me/{page,me-client}.tsx
apps/web/src/app/settings/{page,settings-client}.tsx
```

**Cố ý KHÔNG chạm:**

| File | Vì sao |
|---|---|
| `app/me/layout.tsx`, `app/settings/layout.tsx` | Gác auth + provider tRPC phía server; brief cấm, và chú thích đầu mỗi file giải thích vì sao auth gác ở `page.tsx` chứ không ở đây. Vẫn nằm trong phạm vi quét của cổng — §4.7. |
| `components/me/use-cursor-pages.ts` | Ngăn xếp cursor là LOGIC, brief cấm thay. Không mang chuỗi nào. |
| `lib/cursor-stack.ts`, `CursorPager` | Cơ chế con trỏ, ngoài glob và brief cấm thay. |
| `components/me/{history-page-notice,lesson-progress}.test.ts` | Không ô nào đỏ sau lượt chuyển; sửa chúng là churn. |
| `packages/copy/src/registry.ts` | File khoá của L0; §6.1 cấm lane chạm. Surface `me` đã được đăng ký sẵn nên lane không cần mở nó. |
| `packages/ui/**`, `packages/motion/**` | Ngoài glob; đọc và gọi, không sửa. Hệ quả còn mở ghi ở §6 mục 5. |
| `components/shell/**` (`describeProfileCapacity`, `useCapacity`) | Ngoài glob. Badge sức chứa vẫn đọc câu chữ của vỏ, không tự đặt ngưỡng mới. |

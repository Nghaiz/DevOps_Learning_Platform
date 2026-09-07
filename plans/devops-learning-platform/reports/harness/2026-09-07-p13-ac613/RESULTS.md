# P13 — đợt AC 6 / AC 13 + ba việc chủ dự án giao (2026-09-07)

Ảnh cuối trên cụm: `dlp-web:p13d`. Orchestrator/gateway/migrator giữ tag cũ (không đụng proto).

## Kết quả

| Việc | Kết quả | Bằng chứng |
|---|---|---|
| **AC 13** responsive ≤768px | ĐẠT | `responsive-7of7.log` — 7/7, ba đối chứng âm ở đúng biên |
| **AC 6** cờ `interfaceLayout` | ĐẠT | `ac6-ide-lesson.yml` / `ac6-plain-lesson.yml`, `ide-3pane-after.png` |
| Nút Đăng nhập khoá tới khi hydrate | ĐẠT | `login-ssr.html`, đối chứng JS-tắt |
| `shellcheck` trong ảnh web | ĐẠT | chạy thật trên stdin, trả 3 phát hiện |
| **D15** admin kết thúc phiên người khác | ĐẠT (nửa audit) | dòng `admin_audit` mang id ADMIN |
| Terminal "tật nguyền" | **KHÔNG TÁI HIỆN** | xem §4 |
| Chỉ báo sức chứa | **SAI, ghi vào nợ** | xem §5 |

## 1. AC 13 — và một nửa của nó trước đó là MÃ CHẾT

`NarrowScreenNotice` + `useMinWidth` tồn tại từ đợt 2 với **không một call-site nào**
(`grep -rn NarrowScreenNotice apps/web/src` → chỉ `index.ts` và chính file định nghĩa).
`TerminalPane` chưa bao giờ đọc bề rộng khung nhìn. Nên "≤768px terminal hiện cảnh báo
thay vì vỡ" chưa từng chạy. Đã nối (`terminal-pane.tsx` + `workspace-split.tsx` mới), rồi
mới đo.

"Chưa đo" và "chưa dựng" là hai trạng thái khác nhau; ô AC cũ gộp chúng làm một.

Mỗi khẳng định-hẹp có đối chứng âm cùng route cùng lượt, và đo ĐÚNG biên (768/769,
1023/1024) — một cặp 375/1280 sẽ xanh cả với `md:` (min-width 768), tức không gác được
chính cái lệch một pixel mà `breakpoints.ts` dựng chú thích để tránh.

## 2. AC 6 — phải dựng nội dung trước mới đo được

Tới hôm nay KHÔNG bài nào khai `interface.layout: ide`. Nhánh IDE của nền tảng không có
gì đi qua, nên ô AC này không đo được — **một tính năng không ai dùng thì không ai biết
nó hỏng**. Đã thêm `content/scenarios/dlp-ide-config-edit`.

Đo hai chiều: bài IDE render 2 separator + khoang editor; bài thường 1 separator, 0
khoang. Server cũng đọc đúng cờ — pod của phiên IDE xin `768Mi` (profile `ide`) trong khi
warm pool là `256Mi`.

### 2.1 Và phép đo đầu tiên làm lộ một lỗi khiến IDE hỏng ở gần như MỌI lần mở

Hai lỗi chồng nhau, che nhau:

1. `IdePane` gắn iframe NGAY khi có `sessionId`. Phiên trả về ở t+8s; Theia bind cổng 4000
   ở ~t+20s (số của P6). Log gateway: đúng **một** dòng `dial tcp …:4000: connection
   refused`, rồi im — không có lượt thử thứ hai.
2. Thân 503 (`{"code":"IDE_UNAVAILABLE"}`) **vẫn bắn `load`**, nên `phase` nhảy sang
   `loaded`, lớp phủ biến mất, hạn 45s không bao giờ chạm. Người học nhìn JSON thô, vĩnh viễn.

Gateway, ảnh sandbox `p13ide` và cờ layout đều ĐÚNG. Chỉ nhịp là sai. Chú thích ngay đầu
file đã viết *"`load` không chứng minh thành công"* trong khi mã ngay dưới dùng `load` làm
bằng chứng thành công — một cảnh báo đúng đặt cạnh đoạn mã làm ngược lại thì cảnh báo thua.

Vá: thăm dò mã trạng thái rồi mới gắn iframe. Nghiệm lại trên `p13d` — Theia nạp được ở
lần đầu, console mang log của chính nó.

## 3. Nút Đăng nhập — bốn phép, có đối chứng âm

| phép | kết quả |
|---|---|
| HTML server render | 4/4 nút của form mang `disabled=""`; nút `Giao diện` ở header KHÔNG khoá (đối chứng nội tại) |
| sau hydrate (1348 ms) | cả 4 lật sang enabled |
| **JS tắt** | sau 4s vẫn khoá — vế chứng minh khoá mở *do* hydrate |
| luồng e2e | `lesson.flow` xanh (luồng DUY NHẤT đi qua `signInThroughForm`); 6 luồng: 5 xanh 1 đỏ |

Ô đỏ duy nhất là locator harness ở bước dọn (`getByText('Đã lưu trữ')` khớp cả toast lẫn
vùng `aria-live` phát lại nó); DB xác nhận thao tác đã `archived`. Đã vá bằng cách neo vào
`listitem` — **không** dùng `.first()`, vì `.first()` cũng hết đỏ nhưng giấu sự mơ hồ.
Đây là lần thứ HAI cùng bẫy trong cùng file.

Harness cũng bỏ phép dò khoá nội tạng React `__reactFiber$…`, thay bằng
`expect(submit).toBeEnabled()` — dấu hiệu công khai mà người dùng cũng thấy.

## 4. Terminal — KHÔNG tái hiện, nguyên nhân CHƯA rõ

Triệu chứng chủ dự án báo: dấu nhắc nằm ~40% chiều cao khoang, ~20 dòng trống phía trên,
có thanh cuộn. Cảnh: bài IDE ba khoang, terminal hẹp.

**Server sạch** — tmux của ĐÚNG phiên trong ảnh chụp: `w=52 h=28 cx=3 cy=1 hist=0`,
`capture-pane` cho prompt ở dòng 0–1 và 26 dòng trống **phía dưới**. Client gửi `rows=28`.
Hai bên khớp. Nên lỗi nằm trọn ở tầng vẽ phía client.

Đã bác bỏ, mỗi cái kèm số đo:

| giả thuyết | bác bằng |
|---|---|
| FitAddon đo container sai chiều cao | `floor((559−16)/19)=28` khớp ở 5 kích thước; header/footer không bị tính vào |
| fit chạy trước khi flex có chiều cao | `.xterm-screen` luôn ≤ vùng khả dụng ở 5 kích thước |
| debounce 50ms bỏ lỡ lượt cuối | kéo 13 bước × 20px rồi kéo ngược, `firstNonEmptyRow=0` mọi lần |
| lệch rows server/client | server `h=28`, client gửi `rows=28` |
| prompt tự in dòng trống | `capture-pane` cho prompt ở dòng 0–1 |
| WebGL vẽ lệch ở DPR phân số | `canvas.height / rect.height = 1.499–1.501` = DPR; `offsetTopVsScreen = 0` |

Đo lại trên `p13d` ở đúng cảnh ba khoang (terminal 479×557): dấu nhắc ở **dòng đầu**,
`scrollHeight == clientHeight`, `scrollTop = 0`. Bài hai khoang cũng lành (`term-2pane.png`).

**KHÔNG kết luận rằng bản vá IDE đã sửa nó** — không có bằng chứng nhân quả. Trạng thái
đúng là: chưa tái hiện được, mọi ứng viên cấu trúc đo ra lành ở đúng hình học đã báo.

Một lỗi THẬT tìm được bên lề, chưa chứng minh là nguyên nhân: `terminal-surface.tsx` gọi
`core.measure()` sau khi font tải xong; `measure()` gọi `fitAddon.fit()` nhưng **không bao
giờ phát `onResize`** (chỉ nhánh ResizeObserver phát, mà `fit()` không đổi kích thước
container nên RO không bắn). Nếu phép đo trước-font khác sau-font thì server giữ kích
thước cũ vĩnh viễn. Đo được là latent — cả 7 lượt hai phép đo ra cùng số.

## 5. Chỉ báo sức chứa — đo được, và nó SAI

Giao diện in **"Đang chạy 6/20 phiên (trần cứng 23)" → "Còn 14 chỗ"** đúng lúc
`lessons.startSession` trả **429**. Không mâu thuẫn: hai bên đếm hai thứ khác nhau.

```
requests.memory  5376Mi / 5952Mi   ← còn 576Mi
pods             9 / 28
```

`CAPACITY_HARD_LIMIT=23` **đúng bằng** `5952Mi ÷ 256Mi`. Hằng số đó mã hoá giả định "mọi
phiên đều là profile mặc định".

| profile | RAM xin | trần thật |
|---|---|---|
| mặc định | 256Mi | 23 |
| **ide** | 768Mi | **7** |
| k8s | 1024Mi | 5 |
| k8s-multinode | 1536Mi | 3 |

Đây là một **derived field bị lưu** (`quota ÷ profile`) — thứ `no-derived-fields` cấm. Lỗi
CÓ TỪ TRƯỚC bài IDE (`dlp-k8s-basics` đã xin 1Gi); bài IDE chỉ làm nó lộ.

Chủ dự án chốt 2026-09-07: **ghi vào nợ, không sửa đợt này**. Đường sửa đúng là
`GetCapacity` đọc ResourceQuota lúc đọc, FE tính "còn N chỗ cho bài NÀY" theo profile của
chính bài đó.

## 6. D15 — admin kết thúc phiên người khác

Runbook §3ter mục 17 ghi ô này "chưa có gì chứng minh nó chạy". Đã đo tay:

```
actor_id  = 5NA1BSwuPUil7vUI4BGJBJxonQcu2VKZ   ← ADMIN
target_id = 585b8c82…  (chủ phiên: K7zJVcJHkOdcApfvoi7nCaPEdqicZTMt)
action    = session.terminate
```

Dòng audit mang id **admin**, không phải id chủ phiên — đúng bước 4, nửa quan trọng hơn.
Dòng ngay trên nó (chủ phiên tự bấm) mang id chủ phiên, nên hai nhánh actor phân biệt
được thật.

**Bước 3 CHƯA đo**: người dùng thường có thấy lý do phiên chết không (không phải "Đang
nối lại…"). Cần hai trình duyệt cùng lúc.

## 7. Phép kiểm cuối

```
pnpm turbo run lint typecheck test --continue --concurrency=2
Tasks: 20 successful, 20 total          ← đọc dòng này TRƯỚC khi trích số test
terminal 133 · scenario 255 · ui 585 · web 1089   = 2062 xanh, 0 đỏ
node scripts/check-no-commerce.mjs → exit 0 (đối chứng 18/18, quét 491 file)
```

Hai lượt turbo TRƯỚC đó dừng ở `16/19` và `11/19`; lúc đó bốn task cuối CHƯA CHẠY, và một
lỗi kiểu thật (`exactOptionalPropertyTypes` trong `workspace-split.tsx`) chỉ lộ ở lượt
`--continue`.

## 8. Lỗi đo của chính lượt này, ghi lại để khỏi lặp

- **`ss` không có trong ảnh sandbox.** Tôi đọc "0 cổng nghe" trong 60s và suýt kết luận
  Theia không chạy — trong khi nó chạy suốt. Lệnh vắng mặt trả rỗng, đọc y hệt giá trị 0.
- **`| tail` nuốt mã thoát.** `docker build … | tail` cho `EXIT=0` trong khi build ĐỎ.
  Chính §11 của exec plan cảnh báo điều này.
- **`grep -c $'\r'` suy biến thành `grep -c ''`** (khớp mọi dòng), làm agent test báo
  "185 CRLF" trên một file có CR=0. Phép kiểm đó về cấu trúc không thể trả "sạch".
- **`pkill` không kiểm lại.** Agent test báo "3 luồng, 0 đỏ" khi thực ra 6 luồng đã chạy
  và có 1 đỏ — báo cáo một trạng thái giữa chừng như thể là trạng thái cuối.
- **`.gitattributes`: thêm luật mà không đọc luật đã có.** Tôi thêm `content/**/*.md text
  eol=lf`, ghi đè `content/scenarios/** -text` — một quyết định có tải, gác bản sao
  byte-exact của nội dung vendored. Luật của tôi còn THỪA: cả 60 file `.md` đã được bảo vệ
  sẵn. `git check-attr -a <file>` trả lời trong một lệnh và tôi đã bỏ qua bước đó. Đã gỡ.
- **`results.json` cũ đọc y hệt lượt mới** — `--reporter=list` trên CLI đè reporter json
  nên file không hề được ghi lại.

## 9. Tác dụng phụ trên cụm

- Tài khoản `e2e-ac613-1788774677@dlp.local` được promote lên **admin** (thu hồi:
  `promote-role.sh <email> user`).
- 3 mục nội dung `E2E luồng soạn bài` kẹt ở `published` (người học nhìn thấy) → đã lưu trữ.
- Một phiên của tài khoản e2e khác bị admin kết thúc (phép đo D15), có chủ dự án đồng ý.

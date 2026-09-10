# P16 — Dựng lại toàn bộ frontend theo nhận diện PTIT

**Ngày:** 2026-09-10 · **Loại:** Design (chờ duyệt) · **Trạng thái:** brainstorm xong, chưa được phép thi công
**Phạm vi cấm:** `apps/web/src/components/k8s-arena/**` (17.675 dòng). Không đụng một dòng nào.

> Tài liệu này là kết quả của một lượt scout thật: 4 agent đọc song song toàn bộ cây frontend,
> cộng 2 agent nghiên cứu nhận diện PTIT và kỹ thuật 3D. Mọi con số dưới đây đọc từ file hoặc
> tính tay, không suy từ cảm nhận. Chỗ nào tôi chưa đo được, tôi ghi rõ là chưa đo.

---

## 1. Hiện trạng, đo được

| | |
|---|---|
| TSX trong phạm vi (trừ arena) | 24.848 dòng, 175 component |
| Test colocated đang bám vào đó | 149 |
| Văn bản trong `content/` | ~21.300 từ, 161 file |
| Văn bản trong `packages/games/src/k8s/levels/*.ts` | ~39.250 từ |
| Chuỗi UI inline | ~5.300, **không có tầng i18n nào** |
| Màn hình có cổng a11y/CSP | 22 |
| Màn hình có cổng bàn phím | 4 |

### 1.1 Chẩn đoán "văn phong đầy AI slop" đúng một nửa

Tôi grep toàn bộ dấu hiệu kinh điển: `hãy khám phá`, `hành trình`, `chinh phục`, `toàn diện`,
`giải pháp hoàn hảo`, `delve`, `seamless`, `empower`, `cutting-edge`. **Không có hit thật nào
trong văn bản người dùng đọc.** Tiếng Việt trong repo này viết chắc tay. `catalog-labels.ts:11`
còn từ chối gắn tính từ vào tên hạng vì "một tính từ dán ở đây sẽ là một khẳng định mà trang
danh mục không có dữ liệu để bảo vệ". Đó là kỷ luật biên tập, không phải slop.

Cái hỏng nằm ở cấu trúc và ở cơ khí, và nó nặng hơn nếu chỉ hỏng từ vựng:

1. **Trang chủ là hai lưới ba thẻ liên tiếp**, tự khai trong chú thích: `ba luận điểm` ở
   `value-props.tsx:6`, `ba bước` ở `getting-started.tsx:4`. Đây đúng là hình dạng landing page
   mà mô hình nào cũng đẻ ra.
2. **Một câu bị viết hai lần, cách nhau một cú cuộn.** `value-props.tsx:35` và
   `getting-started.tsx:30` nói cùng một điều bằng gần cùng một chữ.
3. **Nhãn hero là tập con của đoạn hero.** `hero.tsx:25` viết "Sandbox Kubernetes dựng riêng, mở
   trong vài giây"; `hero.tsx:33` viết lại y hệt ý đó, dài hơn.
4. **447 chuỗi UI chứa gạch ngang dài.** Đây là dấu hiệu AI to nhất còn sót trong repo.
5. **Gợi ý lab bị mất dấu tiếng Việt.** `content/labs/dlp-linux-triage/lab.json:15` gửi tới người
   học nguyên văn: `"docker: khong lien quan o buoc nay"`. Đây không phải slop, đây là lỗi.
6. **Mọi bài đều kết thúc bằng `# Xong rồi` rồi `Những thứ đáng mang theo:` và một danh sách
   gạch đầu dòng in đậm.** Cùng một khuôn, 11 lần.

Kết luận: văn phong cần phẫu thuật, không cần đập. Thứ thật sự trông như máy làm là **phần
nhìn**: xám shadcn nguyên bản, không mang một dấu hiệu nhận diện nào.

### 1.2 "Phần lab rất lỗi" đúng, nhưng phần lớn không phải lỗi giao diện

`plans/devops-learning-platform/phase-15.md` ghi ba khiếm khuyết đã đo, tái hiện được, **chưa
sửa**:

- Setup hỏng **không trả lại khe quota**. Lab k8s có 5 khe. Năm lượt hỏng là lab đóng cửa một
  tiếng, hiện "Còn 0 chỗ" trong khi không ai đang học.
- Người học luôn thấy `Script chuẩn bị môi trường thất bại (exit 1)`. Nguyên nhân thật
  (`Cum Kubernetes con khong san sang sau 90s`) bị vứt đi.
- Setup exec đo được 17s lúc rảnh, **93,3s và exit=1 ở load ~43**, trần là 120s.

Chủ dự án đã chốt: đợt này **chỉ frontend**, ba lỗi trên để lại. Ghi thẳng hệ quả để không ai
ngạc nhiên về sau: sau P16 lab sẽ đẹp và vẫn báo "Còn 0 chỗ" đúng như cũ.

### 1.3 Chỗ không ai gác, và đó chính là chỗ xấu nhất

`apps/web/e2e/routes.ts` là danh sách viết tay 22 màn hình, nuôi cả `a11y.spec.ts` lẫn
`csp.spec.ts`. Không có trong danh sách đó:

`/games` · `/games/k8s` · `/problems` · `/problems/:code` · `/author/problems` ·
`/author/problems/new` · `/author/problems/:code`

Đây đúng là nhóm trang chọn bài mà chủ dự án gọi là lỗi nhất và xấu nhất. Chúng cũng là nhóm duy
nhất không có một cổng a11y, CSP hay bàn phím nào. Hai việc này liên quan nhân quả, không phải
trùng hợp.

Cổng bàn phím còn hẹp hơn: đúng 4 màn (`/login`, `/lessons`, `/me`, `/settings`). Khoang lab,
nơi phím Tab và Escape quyết định người học có thoát khỏi terminal được hay không, không nằm
trong đó.

---

## 2. Nhận diện PTIT — số thật, không phỏng đoán

`ptit.edu.vn` **không công bố** mã màu. Trang nhận diện chỉ nói logo lấy đỏ làm chủ đạo và có
ngôi sao vàng. Nên tôi lấy từ chính file vector: hai file SVG độc lập
(`logo-ptit-1.svg` từ kho vector, `logo-tuyen-sinh.svg` từ `tuyensinh.ptit.edu.vn`) trùng nhau
tuyệt đối.

| Vai trò | Hex | Nguồn |
|---|---|---|
| Đỏ biểu trưng (nét quét, chữ PTIT, cuốn sách) | `#DE221A` | `fill` của 10 path, trong **cả hai** SVG |
| Đỏ chữ ký / giao diện | `#BC2626` | `fill` của wordmark, **và** `--primary: #bc2626` trong CSS production của **cả hai** tên miền PTIT |
| Vàng sao, mặt sáng | `#EFF003` | `fill` |
| Vàng sao, mặt tối | `#B89C0E` (+`#B89C0D`) | `fill` |
| Xanh đen wordmark | `#373D4E` | `fill`, chỉ ở lockup của ptit.edu.vn |
| Navy tiêu đề web | `#051A53` | biến CSS `--heading` |
| Chữ thân bài web | `#293A51` | biến CSS `--text` |

File master trong thư mục Drive chính thức **không phải vector**: nó là một PNG 1000×1000 nhúng
base64 trong vỏ SVG. Giải mã ra thì histogram khớp giá trị trên trong sai số 1–2 đơn vị mỗi
kênh, tức là làm tròn raster chứ không phải ý đồ khác. Ảnh trên Wikimedia là **cùng file đó
đăng lại**, nên không tính là nguồn độc lập.

Đỏ PTIT **không phải** đỏ cờ. `#DE221A` cách `#DA251D` 5,8 đơn vị RGB (gần nhưng khác);
`#BC2626` cách 31,3 (khác hẳn). Sao cũng hai tông có mặt sáng mặt tối, không phải sao phẳng của
cờ. Đừng thay bằng màu cờ.

### 2.1 Contrast, tính tay theo WCAG 2.1

| Cặp | Tỉ lệ | Kết |
|---|---|---|
| `#BC2626` trên trắng | **6,10:1** | đạt AA thoải mái |
| `#DE221A` trên trắng | **4,83:1** | đạt AA nhưng sát ngưỡng, không còn dư địa |
| `#373D4E` trên trắng | **10,83:1** | đạt AAA |
| `#051A53` trên trắng | 16,42:1 | đạt AAA |
| `#EFF003` trên trắng | **1,23:1** | **không dùng được trên nền sáng** (trên đen: 17,14:1) |

**Chốt vai trò, theo đúng cách chính PTIT đang làm:** `--primary` là **`#BC2626`**. `#DE221A`
dành riêng cho việc tái hiện logo, không dùng làm màu giao diện.

Lý do không phải thẩm mỹ. `#BC2626` vừa là fill của wordmark chính thức, vừa đúng là token
`--primary` đang chạy trên cả hai trang của Học viện, và 6,10:1 cho dư địa mà 4,83:1 không có.
Bảo vệ được trước hội đồng vì đó là thứ nhà trường đang dùng thật.

`#373D4E` cho 10,83:1, đến từ chính logo, và đọc dễ chịu hơn đen thuần. Nó thay `--foreground`
gần-đen hiện tại.

Vàng `#EFF003` chỉ đặt trên nền tối. Đặt nó lên nền trắng là 1,23:1, tức là gần như vô hình.

### 2.2 Đỏ thương hiệu đụng đỏ báo lỗi — lỗi có thật, đang tồn tại

Hệ hiện tại: `--primary` là `oklch(0.58 0.23 25)`, `--destructive` là `oklch(0.577 0.245
27.325)`. Hai màu đó **mắt thường không phân biệt được**. Nghĩa là hôm nay nút "Lưu" và nút
"Xoá vĩnh viễn" trông như nhau cho tới khi đọc chữ.

Đổi primary sang `#BC2626` không tự cứu được chuyện này, vì destructive vẫn thuộc họ đỏ. Tôi
thử hướng "để destructive tối hơn": `#8C1D18` cho trắng-trên-nền 9,11:1, rất đẹp, nhưng **tương
phản giữa nó và đỏ primary dưới 2:1**, dưới xa ngưỡng 3:1 cho thành phần phi-văn-bản. Đổi sắc độ
không cứu được.

**Luật chốt, hai kênh chứ không một:**

- Nút hành động chính: **nền đặc** `#BC2626`, chữ trắng, **không icon**.
- Nút phá huỷ: **viền, nền trong suốt**, chữ đỏ, **bắt buộc có icon `TriangleAlert`**.
- Hộp xác nhận (`ConfirmDialog` đã có sẵn) giữ nguyên cho mọi hành động phá huỷ.

Khác nhau ở *hình* (đặc và rỗng) chứ không chỉ ở *màu*. Người mù màu đọc được, người liếc nhanh
cũng đọc được. Con số 1,89 ở trên là lý do icon là bắt buộc, không phải trang trí.

### 2.3 Ngôi sao và cuốn sách

Sao vàng `#EFF003` / `#B89C0E` không dùng làm màu giao diện. Nó là **dấu hiệu thành tựu**: lộ
trình hoàn thành, quiz đúng tuyệt đối, lab đạt hết nhiệm vụ. Một chỗ, một nghĩa. Dùng vàng cho
badge chung chung là giết mất sức nặng của nó.

Cuốn sách mở ở chân logo trở thành hình nền chìm của khu vực nội dung bài học.

---

## 3. Ý tưởng thiết kế — một hình duy nhất cho cả hệ

Logo PTIT có một hình chủ đạo: **một vòng ellipse hở**, quét quanh chữ PTIT và không khép lại.

Biểu tượng phổ quát của DevOps là vòng lặp CI/CD. Ý tưởng lõi của Kubernetes, mà chính nội dung
bài học của dự án này gọi tên ở `packages/games/src/k8s/levels/l06.ts:68`, là **reconciliation
loop**: liên tục so trạng thái mong muốn với trạng thái thực tế rồi thu hẹp khoảng cách.

Cùng một hình. Cùng một ý. Đó là xương sống của toàn bộ thiết kế, và nó không phải một phép ẩn
dụ khiên cưỡng đi mượn: nó là thứ trường này đã vẽ trên logo và là thứ nền tảng này đang dạy.

Nó đẻ ra chi tiết cụ thể ở mọi tầng:

- **Trang chủ**: camera đi dọc vòng ellipse đó. Mỗi chặng cuộn là một trạm trên vòng lặp. Cuộn
  hết thì vòng khép lại và trạm cuối nối về trạm đầu.
- **Thanh tiến độ**: cung tròn theo nét quét, không phải thanh thẳng.
- **Thẻ danh mục**: một cung màu ở góc thay cho viền trái phẳng.
- **Khoang lab**: nhiệm vụ hoàn thành vẽ dần một cung khép kín.
- **Trạng thái đang tải**: chính vòng ellipse đang tự vẽ ra.
- **Trạng thái rỗng**: vòng ellipse hở, bên trong không có gì.

---

## 4. Chữ

Be Vietnam Pro giữ nguyên. Nó đã đúng: có subset `vietnamese`, `next/font/google` tự host nên
`font-src 'self'` không chặn, và `layout.tsx:24` đã ghi rõ lý do. Không đổi.

Chữ đơn cách (code inline như `kubectl get pods`) dùng `ui-monospace` của hệ. Không tải thêm
font nào. Terminal giữ `dlp-terminal-nf.woff2` đang có, vì nó được dựng riêng cho glyph Nerd
Font hai ô của xterm.

Thang cỡ chữ đặt lại từ đầu, dựa trên `clamp()` để trang chủ cỡ lớn không cần điểm ngắt riêng.

---

## 5. Giọng văn — hợp đồng, không phải khuyến nghị

Đây là phần dễ trôi nhất, nên nó phải nằm trong một file có test gác, không nằm trong đầu ai.

**Luật:**

1. Xưng "bạn". Không "các bạn học viên", không "quý người dùng".
2. Câu đầu tiên phải mang thông tin. Không có câu khởi động.
3. **Cấm gạch ngang dài trong câu văn.** Dùng dấu phẩy, ngoặc đơn, hoặc tách câu. Ngoại lệ duy
   nhất: dải phân cách trong badge dạng `Trung cấp · 25 phút`, mà chỗ đó dùng dấu chấm giữa.
4. Thông báo lỗi phải trả lời hai câu: hỏng cái gì, giờ làm gì. Một mã thoát không phải câu trả
   lời.
5. Không liệt kê đúng ba ý trừ khi thật sự có ba. Hai được. Năm được. Một được.
6. Đủ dấu tiếng Việt ở mọi nơi, kể cả JSON và script shell.
7. Số cụ thể thay tính từ. "6/6 nhiệm vụ, chấm lúc 14:32" thay vì "Chúc mừng bạn đã hoàn thành
   xuất sắc".
8. Không có câu tổng kết ở cuối. Kết ở ý cuối cùng có thật.

**Cách gác:** `packages/copy` giữ mọi chuỗi người dùng đọc. Một test quét toàn bộ giá trị trong
đó và đỏ nếu thấy ký tự `—`, thấy chuỗi tiếng Việt mất dấu, hoặc thấy một khoá có đúng ba phần
tử mảng mà không khai `intentionalThree: true`. Luật số 3 và số 6 trở thành phép đo, không còn
là lời nhắc.

---

## 6. Kiến trúc gói

Chủ dự án chốt: đập cả plumbing, viết lại từ file trắng. Tôi làm đúng thế, và giữ lại đúng ba
thứ **dưới dạng yêu cầu của mã mới**, không phải dưới dạng mã cũ được tha:

### 6.1 Bất biến không được phép trôi

**Terminal không bao giờ đổi cha và không bao giờ bị `unmount`.**
`workspace-panel.tsx:38` giải thích: đổi cha nghĩa là unmount, nghĩa là WebSocket đóng, nghĩa là
người học mất phiên giữa bài mà không có một lỗi nào hiện ra. Hàng 1 (editor) phải luôn được
render kể cả khi vắng, chỉ đặt `hidden`, vì React đối chiếu con tĩnh **theo vị trí**.

Kèm theo một bẫy đã ghi trong bộ nhớ dự án và phải viết lại vào mã mới: phần tử mang `hidden`
**không được** mang thêm tiện ích `display` của Tailwind. Luật tác giả `.flex{display:flex}`
thắng luật trình duyệt `[hidden]{display:none}` ở cùng độ đặc hiệu, và `hidden` bị vô hiệu trong
im lặng.

**Chỉ một landmark `<main>` trong toàn ứng dụng**, do vỏ sở hữu. Trang không được render `<main>`
của riêng nó.

**Hợp đồng bốn trạng thái.** `design-system.contract.test.tsx` hiện bắt mọi component export
phải khai đủ bốn trạng thái trong `docs/design-system.md`, và có cả đối chứng dương chứng minh
cổng đỏ được khi tài liệu sai. Kỷ luật này đi tiếp sang hệ mới. Mất nó là mất khả năng biết hệ
thiết kế có còn đúng hay không.

**Đa terminal đã bị xoá có chủ ý** (2026-09-07), có một test khẳng định sự vắng mặt đó. Không
hồi sinh.

### 6.2 Gói mới

| Gói | Nội dung |
|---|---|
| `packages/ui` | Viết lại từ đầu. Token PTIT, primitive, motion primitive, hợp đồng bốn trạng thái. |
| `packages/copy` | **Mới.** Toàn bộ chuỗi người dùng đọc, một giọng, có test gác. |
| `packages/motion` | **Mới.** Ellipse motif, cung tiến độ, biến thể framer-motion dùng chung, cổng reduced-motion mức JS. |

Lý do tách `packages/motion`: trang chủ 3D và khoang lab dùng chung cùng một hình ellipse. Để
mỗi bên tự vẽ là hai hình sẽ lệch nhau ở lần sửa thứ hai.

### 6.3 Phụ thuộc mới

| Gói | Bản | Ghi chú |
|---|---|---|
| `framer-motion` | 13.2.0 | Peer bắt buộc của cả hai thư viện gooey. |
| `sonner` | 2.0.8 | `goey-toast` phụ thuộc. |
| `gooey-search-tabs` | 0.2.0 | Ghim chính xác, không dùng `^`. |

**`goey-toast` không cài qua npm.** Nó đang ở 0.5.0 và `gooey-search-tabs` ở 0.2.0. Một gói 0.x
có thể đổi API bất cứ lúc nào, và toast là thứ nằm ở 18 chỗ. `goey-toast` có sẵn đường registry
kiểu shadcn (`npx shadcn add .../r/goey-toaster.json`) đưa thẳng mã nguồn vào repo. Chọn đường
đó: ta sở hữu file, ghim được, sửa được token màu cho khớp PTIT, và không phụ thuộc vào một
phiên bản 0.x của người khác. `gooey-search-tabs` chưa có registry nên ghim phiên bản chính xác.

**CSP đã kiểm, không cần nới:** `style-src 'self' 'unsafe-inline'` phủ style inline của
framer-motion. `script-src` dùng nonce và `strict-dynamic`, **không có** `unsafe-eval`, và
framer-motion không cần eval.

### 6.4 Toast và search, quy mô thật

Toast hiện là Radix tự bọc, `packages/ui/src/toast.tsx` (114 dòng), gắn một lần ở
`layout.tsx:100`, **18 chỗ gọi trên 13 file, không chỗ nào nằm trên route người học**. Thay thế
gọn.

Search thì ngược lại: hôm nay toàn ứng dụng có **đúng một** ô tìm kiếm thật
(`problems-toolbar.tsx:70`). `CatalogToolbar` mà 5 trang danh mục dùng chung **không có ô tìm
kiếm nào**, chỉ có chip lọc và một select sắp xếp. Nên `gooey-search-tabs` ở đây không phải thay
thế, mà là **thêm một năng lực chưa từng có** vào 5 trang danh mục. Tab của nó ánh xạ tự nhiên
sang bộ lọc độ khó và hạng sandbox đang có.

---

## 7. Trang chủ 3D

Bảy chặng, cuộn dẫn chuyện, đi đúng một vòng rồi khép:

1. Máy của bạn. Một con trỏ nhấp nháy.
2. Commit rời khỏi máy.
3. Build. Các lớp image xếp chồng lên nhau.
4. Image đẩy lên registry.
5. Cụm nhận. Scheduler xếp pod lên node.
6. Một pod chết. Cụm tự vá, không ai gõ gì.
7. Traffic chạy qua. Vòng khép lại và nối về chặng 1.

Chặng 6 là chặng quan trọng nhất và là chặng mọi landing page DevOps khác bỏ qua. Nó là lý do
Kubernetes tồn tại, và nó chỉ kể được bằng chuyển động.

### 7.1 Kỹ thuật — cách hiển nhiên là cách sai

**⛔ Không dùng `ScrollControls` của drei.** Đọc thẳng từ bản đã cài
(`drei@10.7.8/web/ScrollControls.js`): `ScrollHtml` gọi
`useMemo(() => ReactDOM.createRoot(state.fixed))` rồi `root.render(...)` ngay trong thân
component. Hệ quả với một trang chủ:

- Toàn bộ chữ trong `<Scroll html>` nằm trong **một React root thứ hai, tách rời**. Nó **không
  có HTML server nào**. Tức là mất LCP, mất SEO. Với trang tiếp thị thì đó là loại thẳng.
- Nó gắn một `<div>` cuộn vào `gl.domElement.parentNode` và trói lại sự kiện con trỏ. Trang mất
  cuộn tài liệu gốc: mất khôi phục vị trí cuộn, mất anchor link, mất `IntersectionObserver`
  trên chính các section của mình.
- Lỗi `createRoot` bị gọi hai lần dưới React 19 StrictMode vẫn **chưa được sửa** trên `master`
  của drei ([drei#2431](https://github.com/pmndrs/drei/issues/2431) đóng với lý do "đã phát hành
  ở bản alpha"; [PR #2135](https://github.com/pmndrs/drei/pull/2135) đóng mà không merge).

**Cách dùng:** cuộn tài liệu gốc, ghi tiến độ vào một `ref`, `useFrame` đọc `ref` đó, cộng
`frameloop="demand"` và gọi `invalidate()` mỗi lượt cuộn. Giá trị chuyển từ DOM sang `useFrame`
đi qua **ref**, không bao giờ qua `useState`. Đọc `14islands/r3f-scroll-rig` trước khi tự viết
bộ dẫn động.

### 7.2 CSP — đã đo, không cần nới, nhưng có ba quả mìn

Grep chính bản đã cài để tìm `eval(`, `new Function(`, `WebAssembly`:

| Gói | `eval(` | `new Function(` | `WebAssembly` |
|---|---|---|---|
| `three@0.185.1` | 0 | 0 | 0 |
| `@react-three/fiber@9.7.0` | 0 | 0 | 0 |
| `@react-three/drei@10.7.8` (320 file js) | 0 | 0 | 0 |
| `postprocessing@6.39.4` | 0 | 0 | 0 |

CSP hiện tại **đủ dùng**. `postprocessing` ghép GLSL bằng nối chuỗi rồi đưa cho
`gl.shaderSource()`, mà CSP không quản GLSL, và không có `eval` nào ở giữa.

Ba thứ phải tránh, không nằm trong bốn gói trên:

1. **`<Text>` của drei.** Nó kéo `troika-worker-utils`, thứ dò khả năng worker bằng
   `new Worker(URL.createObjectURL(new Blob(...)))`. CSP của ta không có `worker-src`, nên rơi
   về `script-src`, thứ không cho `blob:`. Troika bắt lỗi và tự hạ cấp nên **chức năng không
   hỏng**, nhưng trình duyệt vẫn bắn `securitypolicyviolation` **kể cả khi lỗi đã bị bắt**.
   Đúng hình dạng của bug `Function("")` của Zod mà repo này đã sửa bằng `z.config({ jitless:
   true })`. **Dùng nhãn DOM/HTML đè lên canvas, không dùng `<Text>`.** (Cơ chế thì chắc chắn;
   việc chính probe này bắn sự kiện thì chưa đo, hãy tái hiện bằng bộ thu của `csp.spec.ts`
   trước khi tin.)
2. **Không dùng asset nén Draco / KTX2 / meshopt.** Các loader tương ứng trong `three-stdlib`
   cần WebAssembly, và ta sẽ phải nới `wasm-unsafe-eval` cộng `worker-src`. Hình học sinh bằng
   mã hoặc glTF không nén thì sạch.
3. `img-src 'self' data:` **không có `blob:`**, nên `canvas.toBlob()` cho tính năng chụp ảnh
   chia sẻ sẽ bị chặn.

### 7.3 Ngân sách và lối lùi

- Cổng LCP hiện tại đo `/lessons`, **không đo `/`**. Nên cảnh 3D không phá cổng nào đang có. Nó
  cần một ngân sách riêng, đặt mới, vì "không có cổng" không phải là "đã đạt".
- **Canvas không được là phần tử LCP.** Server render `<h1>`, đoạn dẫn và một khung tĩnh trước.
  Canvas gắn vào sau, và chỉ gắn khi `IntersectionObserver` báo đã vào tầm cộng một lượt
  `requestIdleCallback`. `next/dynamic` với `ssr: false` **phải được gọi bên trong một component
  `'use client'`**, không gọi được từ Server Component.
- **Cổng reduced-motion phải ở mức JS.** Khối `@media (prefers-reduced-motion: reduce)` cuối
  `globals.css` dùng bộ chọn phổ quát và `!important`, rất đúng cho CSS, nhưng nó **không thể**
  dừng một vòng `requestAnimationFrame`. Nếu chỉ dựa vào nó, trang sẽ trông như đã tuân thủ
  trong khi canvas vẫn chạy. Đây đúng lớp lỗi "xanh mà không chứng minh gì".
  Có WebGL mà bật reduced-motion thì giữ canvas nhưng mỗi chặng là một khung tĩnh, cuộn nhảy
  chặng chứ không nội suy.
- **Dò WebGL2 phải có `failIfMajorPerformanceCaveat: true`.** Thiếu cờ đó thì SwiftShader và
  llvmpipe trả lời "có", và ta được một context chạy hàng trăm mili giây một khung. Repo này đã
  dính đúng chuyện đó rồi: `--disable-gpu` **không** gỡ WebGL2, chỉ `--disable-3d-apis` mới cho
  một trình duyệt thật sự không có WebGL, và đó là cờ cần dùng nếu muốn CI đi vào nhánh lùi.
  Không có WebGL2 thì **không gắn `<Canvas>`**, render bảy chặng thành danh sách thẻ dựng từ
  server, cùng thứ tự, cùng câu chuyện, không JS. Bản đó cũng chính là thứ máy tìm kiếm đọc.
- Trần số pod hiển thị do **mắt** quyết định chứ không phải GPU: vài chục tới khoảng 200. Thứ
  cắn trước số instance là shadow map, số pass hậu kỳ, và `dpr` 2.

**Ảnh sinh bằng AI:** `img-src 'self' data:` nghĩa là không hotlink được. Mọi ảnh sinh ra phải
commit vào repo và phục vụ từ chính origin. Ghi ra đây để không ai mất một ngày đi tìm lý do ảnh
không hiện.

**Đọc trước khi viết:** `14islands/r3f-scroll-rig` (đồng bộ mesh với phần tử cuộn theo DOM),
`pmndrs/react-three-next` (bố cục App Router chuẩn, canvas bền, `<View/>` cắt viewport),
`igloo.inc` (nhịp chặng và cách chuyển từ khung tĩnh sang canvas).

---

## 8. Khoang lab, phần quan trọng nhất

Hôm nay:

- `lab-client.tsx` 713 dòng, `workspace-panel.tsx` 535 dòng, `lesson-client.tsx` 502 dòng.
- Chia đôi bằng flexbox tự viết cộng pointer-capture, không dùng thư viện.
- Vỏ ứng dụng vẫn hiện đầy đủ trên trang lab. Chỉ `/games/k8s` chạy immersive.
- **Lab không có tab Editor.** `IdePane` nằm trong `app/lessons/[id]/`, và `lab-client.tsx:183`
  ghi rõ đây là lựa chọn có chủ ý, không phải thiếu sót.
- Lab chỉ có một tab, nên thanh tab render một mục duy nhất, không có `role="tablist"`.

Đề xuất:

1. **Trang lab và lesson vào immersive.** Thanh nav toàn cục ăn 56px chiều cao trên màn hình mà
   từng pixel dọc đều là dòng terminal. Thay bằng một thanh mảnh mang đúng thứ cần: tên bài,
   tiến độ dạng cung, nút thoát, chỗ còn lại.
2. **Chia đôi viết lại**, vẫn tự viết chứ không thêm thư viện, nhưng tách phần quyết định hình
   học ra khỏi React như `workspace-tabs.ts` đang làm. Cách đó đúng và giữ lại.
3. **Đưa `IdePane` ra `components/session/`** để lab dùng được. Việc bật IDE cho lab nào là
   quyết định nội dung, không phải quyết định kiến trúc.
4. **Bảng nhiệm vụ thiết kế lại.** Hôm nay là một `<table>`. Nó cần đọc được như một danh sách
   kiểm, có trạng thái đang chấm, đạt, hỏng hạ tầng (khác hẳn "chưa đạt", và `lab-client.tsx` đã
   phân biệt đúng ở tầng dữ liệu rồi, chỉ là phần nhìn chưa nói ra).
5. **Khoang IDE.** `ide-pane.tsx` mới được sửa đúng hồi 2026-09-07: thăm dò bằng `fetch` rồi mới
   gắn iframe. Logic đó giữ. Phần nhìn của màn hình chờ 45 giây thì làm lại, vì hai mươi giây
   nhìn một khối xám đọc ra là trang hỏng.

---

## 9. Lanes và cách chạy song song

Contract trước, fan-out sau. Ba file SSOT phải viết và commit **trước khi** spawn bất kỳ lane
nào, theo `rules/contract-first-integration.md`:

- `contracts/p16-tokens.md` — token màu, thang chữ, spacing, motion, elevation
- `contracts/p16-copy.md` — luật giọng văn và API của `packages/copy`
- `contracts/p16-workspace.md` — bất biến terminal, viết lại cho mã mới

| Lane | Sở hữu | Chặn bởi |
|---|---|---|
| L0 nền | `packages/ui`, `packages/copy`, `packages/motion`, `globals.css` | không |
| L1 vỏ + xác thực | `components/shell/**`, `/login`, `/register`, `/forgot-password`, `/reset-password` | L0 |
| L2 trang chọn bài | `components/catalog/**`, 5 danh mục, `/games`, `/problems` | L0 |
| L3 khoang lab | `components/session/**`, `/labs/[id]`, `/lessons/[id]` | L0 |
| L4 trang chủ 3D | `components/marketing/**`, `app/page.tsx` | L0 |
| L5 admin | `app/admin/**`, `components/admin/**` | L0 |
| L6 author | `app/author/**`, `components/author/**` | L0 |
| L7 me + settings | `app/me`, `app/settings`, `components/me/**` | L0 |
| L8 cổng nghiệm thu | `apps/web/e2e/**` | L1..L7 |

**Cách ly git:** mỗi lane một `git worktree` riêng. Lý do không phải lý thuyết: các lane dùng
chung một working tree thì lượt ghi thứ hai **đè** lượt đầu, không có dấu xung đột, không lỗi
biên dịch, và chỉ lộ ra rất lâu sau đó. Rủi ro cao nhất nằm ở file không thuộc về lane nào:
`globals.css`, `packages/ui/src/index.ts`, `e2e/routes.ts`. Cả ba do L0 và L8 sở hữu độc quyền,
ghi tên trong brief.

Mỗi lane **tự viết copy của mình qua `packages/copy`** ngay khi dựng. Không có lượt "sửa văn
phong toàn hệ" ở cuối. Một lượt như thế chạm 500 file và đua ghi với mọi lane khác.

---

## 10. Cổng nghiệm thu

1. `SCREENS` trong `e2e/routes.ts` phủ **32 màn**: 22 hiện tại, cộng 7 màn games/problems đang bị
   bỏ sót, cộng 3 màn xác thực mới (`/register`, `/forgot-password`, `/reset-password`).
   `MIN_SCREENS` nâng theo. Mọi màn 0 lỗi axe mức serious và critical.
2. Cổng bàn phím mở rộng từ 4 lên tối thiểu 10 màn, **bắt buộc gồm `/labs/:id` và
   `/lessons/:id`**, và phải khẳng định thoát được focus khỏi terminal bằng bàn phím.
3. `csp.spec.ts` xanh trên toàn bộ 32 màn, không nới một chỉ thị CSP nào.
4. Grep màu trần rỗng trên `apps/web/src` và `packages/ui/src`: không `#hex`, không
   `slate|gray|zinc|neutral-\d+`. Ngoại lệ duy nhất vẫn là bảng ANSI của terminal.
5. Test contrast tính lại toàn bộ token PTIT, trộn alpha trong **sRGB đã mã hoá gamma** chứ
   không phải linear-light. `docs/design-system.md` §1a đã ghi lại đúng lỗi này và cách nó từng
   chứng nhận cho thứ cần chặn; hệ mới không lặp lại.
6. Test giọng văn: không ký tự `—` trong `packages/copy`, không chuỗi tiếng Việt mất dấu trong
   `packages/copy` lẫn `content/**`.
7. Hợp đồng bốn trạng thái xanh, kèm đối chứng dương chứng minh cổng đỏ được.
8. Test bất biến terminal: khẳng định terminal giữ nguyên cha khi đổi tab, và hàng editor vắng
   mặt vẫn được render kèm `hidden` mà không mang tiện ích `display`.
9. Ngân sách LCP mới cho `/`, đo trên cụm lab, ghi số đo vào chú thích như `perf.spec.ts` đang
   làm.
10. `pnpm -w turbo run build lint typecheck test` xanh. Đọc dòng `Tasks: X/Y` trước khi trích
    bất kỳ con số nào, vì turbo dừng sau task đỏ và các suite sau đó **chưa chạy**.

---

## 11. Rủi ro

| Rủi ro | Mức | Cách chặn |
|---|---|---|
| Mất bất biến terminal khi viết lại | **Cao** | Test bất biến viết TRƯỚC khi dựng lại khoang. Hỏng kiểu này im lặng và người học là người phát hiện. |
| 149 test bị xoá cùng mã cũ | Cao | Chuyển **khẳng định**, không chuyển mã. Mỗi lane phải chứng minh test tương đương trước khi xoá bản cũ. |
| Bảy màn games/problems vẫn không ai gác | Trung bình | AC số 1. |
| Quiz và lộ trình đọc từ DB | Trung bình | Sửa `content/*.json` xong phải chạy lại `scripts/seed-content.mjs`. Sửa file mà không seed thì không có gì đổi và cũng không có lỗi nào. |
| Gói 0.x đổi API | Trung bình | Vendor `goey-toast` vào repo; ghim chính xác `gooey-search-tabs`. |
| Cảnh 3D bỏ qua reduced-motion | Trung bình | Cổng mức JS, không dựa vào CSS. |
| Đỏ primary đụng đỏ báo lỗi | Trung bình | Luật hai kênh ở §2.2. |
| `<Text>` của drei bắn vi phạm CSP | Trung bình | Cấm dùng, thay bằng nhãn DOM. Xem §7.2. |
| Phiên song song của chủ dự án | Thấp (đã hỏi) | Phiên kia ở `components/k8s-arena/**`, không lane nào của P16 ghi vào đó. Điểm tiếp xúc duy nhất là test đối chiếu icon ở §12, và nó chỉ đọc. Mỗi lane vẫn một `git worktree` riêng vì các lane còn đua với nhau. |
| Trang đặt lại mật khẩu trông như chạy được nhưng chưa nối backend | Trung bình | Trạng thái thành công phải nói đúng rằng tính năng chưa bật. Xem §12. |

---

## 12. Đã chốt với chủ dự án (2026-09-10)

**Trang xác thực: tách, và thêm quên mật khẩu.** `/login`, `/register`, `/forgot-password`,
`/reset-password` thành bốn trang riêng, thiết kế lại từ đầu. Ba màn mới vào danh sách gác
a11y/CSP, nên `SCREENS` lên **32 màn** chứ không phải 29 như §10 viết lúc đầu.

⚠ Đợt này là frontend-only, mà đặt lại mật khẩu cần backend gửi mail. Nên `/forgot-password` và
`/reset-password` dựng đủ giao diện và trạng thái, gọi vào một chỗ nối chưa có thật. Phải nói rõ
trong plan để không ai tưởng luồng đã chạy được. Một trang gửi form vào hư không mà vẫn hiện
"Đã gửi mail" là dối người dùng, nên trạng thái thành công phải nói đúng rằng tính năng chưa
bật.

**Icon định danh tài nguyên k8s: giữ, nhưng không được trích ra.**
`components/k8s-arena/hud/resource-icon.tsx` vừa nằm trong vùng cấm, vừa đang được sửa ở một
phiên song song. Hôm nay **không có gì ngoài arena import nó**.

Cách làm: L2 dựng bảng icon riêng trong `packages/ui`, dùng đúng bộ icon lucide đó, cộng một
test đối chiếu khẳng định hai bảng khớp nhau trên **mọi** `ResourceKind`. Test chỉ **đọc** file
arena, không sửa. Phiên kia đổi một icon thì test đỏ và nói ra, thay vì hai bảng lệch nhau
trong im lặng. Đây cũng là lý do không chọn cách chép tay: chép tay thì lệch mà không ai biết.

**Phiên song song đang ở k8s arena.** Không lane nào của P16 đụng `components/k8s-arena/**` hay
`packages/games/**`. Rủi ro đè file hạ từ Cao xuống Thấp, với đúng một điểm tiếp xúc là test
đối chiếu icon ở trên, và điểm đó chỉ đọc.

## 13. Còn treo

- `/games` giữ toolbar riêng (`games-toolbar.tsx`, 122 dòng) vì nó không có backend. Sau khi
  thêm ô tìm kiếm thì gộp về toolbar chung hay giữ tách? Quyết được lúc L2 chạy, không chặn plan.

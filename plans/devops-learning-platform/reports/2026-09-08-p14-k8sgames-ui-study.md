# P14 — Nghiên cứu UI/bố cục `rohitg00/k8sgames`

**Ngày:** 2026-09-08 · **Đối tượng:** `github.com/rohitg00/k8sgames`, nhánh `main` · **Phạm vi:** CHỈ giao diện, bố cục, thị giác. Phần license / incident / level / mode đã có ở `2026-09-08-p14-k8sgames-upstream-study.md`, không lặp lại.

**Vì sao có báo cáo này:** bản dựng đầu của ta là bố cục chia đôi (canvas một ô, panel một cột bên cạnh). Chủ dự án bác. Bản gốc của họ là canvas tràn màn hình với overlay nổi đè, và trông hơn hẳn. Cần cấu trúc đủ chính xác để dựng lại — **không lấy code**.

**Cách lấy dữ liệu:** GitHub raw API → thư mục scratchpad **ngoài** working tree. Không clone vào repo. 14 file đã đọc: `index.html` (1.988 dòng), `style.css` (1.611 dòng), 8 module `js/ui/*`, 4 module `js/rendering/*`. Mọi con số dưới đây đọc từ file, không suy từ ảnh chụp.

> ⚠ Mọi trích đoạn CSS/HTML trong báo cáo này là **Apache-2.0, © 2026 Rohit Ghumare**, trích ngắn để minh hoạ cấu trúc. **KHÔNG dán bất kỳ đoạn nào vào codebase của ta.** Ta lấy *số đo* và *quan hệ hình học*, không lấy văn bản mã.

**Đọc kèm:** `phase-14-exec.md` §12 (hợp đồng C8). Chỗ nào cách của họ tốt hơn cách ta đang định làm, tôi nói thẳng và đề nghị sửa §12.

---

## 1. Khung bố cục

### 1.1 Nguyên tắc gốc: một canvas `position: fixed; inset: 0`, mọi thứ khác nổi lên

Đây là toàn bộ bí quyết, và nó gọn hơn ta tưởng. Canvas không nằm trong bất kỳ ô nào:

```css
/* style.css — upstream Apache-2.0 */
#game-canvas {
  position: fixed;
  top: 0;  left: 0;
  width: 100%;  height: 100%;
  z-index: 0;
  display: block;
  touch-action: none;
}
```

`html, body { width:100%; height:100%; overflow:hidden }`, và `<body class="… overflow-hidden select-none">`. Không có scroll trang, không có vỏ ứng dụng nào bọc ngoài. **Canvas là nền, đúng nghĩa `z-index: 0`.**

### 1.2 Thủ thuật quyết định: lớp overlay trong suốt với `pointer-events` đảo chiều

Đây là chi tiết đáng giá nhất trong cả báo cáo, và nó chỉ có 8 dòng CSS:

```css
/* style.css — upstream Apache-2.0 */
#game-container {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: none;
  pointer-events: none;   /* lớp phủ KHÔNG ăn chuột */
}
#game-container.active { display: block; }
#game-container > * { pointer-events: auto; }  /* nhưng con của nó thì có */
```

Một lớp phủ toàn màn hình đặt trên canvas, **trong suốt với chuột**, và từng phần tử con tự bật lại `pointer-events`. Nhờ vậy: mọi khoảng trống giữa các panel vẫn xoay/zoom được camera, trong khi panel vẫn bấm được. Không cần tính z-index cho từng vùng, không cần hit-test thủ công, không cần đo toạ độ.

**Bên ta nên lấy nguyên mẫu hình này.** §12.2 nói "mọi khối ngoài canvas là overlay định vị tuyệt đối" nhưng chưa nói *cơ chế* nào cho phép canvas vẫn nhận chuột ở khoảng trống. `pointer-events: none` trên container + `auto` trên con chính là cơ chế đó. Đề nghị ghi thẳng vào §12.2.

### 1.3 Sự thật không khớp với ảnh chụp: overlay KHÔNG nằm hết trong một lớp

Đọc kỹ thì có **hai** họ overlay, khác nhau ở nơi gắn DOM:

| Họ | Gắn vào | Thành viên |
|---|---|---|
| **Trong `#game-container`** | markup tĩnh của `index.html` | `#objectives-panel` (thẻ level), `#view-toolbar` (thanh dưới), `#resource-palette` (rail trái), `#game-github-badge` |
| **Gắn thẳng `document.body`** | JS tạo lúc chạy | `#hud` (thanh trên), `#minimap`, `#inspector-panel`, `#incident-panel`, `#metrics-dashboard`, `#command-bar`, `#context-menu`, `#ingame-settings-panel` |

Họ thứ hai **không** thừa hưởng `pointer-events: none` của `#game-container`, nên mỗi cái phải tự khai (HUD khai `pointer-events-none` ở container rồi `pointer-events-auto` ở thanh bên trong — lặp lại đúng thủ thuật §1.2 một cách thủ công).

Đây là **nợ kiến trúc của họ, không phải thiết kế**: hai đường gắn DOM khác nhau cho cùng một lớp thị giác. Bên ta chỉ nên có **một** lớp overlay (`#game-overlay`), mọi panel là con của nó. Rẻ hơn, và quan trọng hơn: thứ tự tab khi đó = thứ tự DOM trong đúng một cây, chứ không phải hợp của hai cây (xem §7).

### 1.4 Bản đồ hình hộp — số đo thật

Viewport `W × H`, gốc toạ độ trên-trái.

| Vùng | `position` | Neo | Kích thước | `z-index` |
|---|---|---|---|---|
| `#game-canvas` | `fixed` | `inset: 0` | `100% × 100%` | **0** |
| `#hud` (thanh trên) | `fixed` | `top:0 left:0 right:0` | tràn ngang, **cao ~48px** (`py-2` + text-sm) | **40** |
| `#resource-palette` (rail trái) | `fixed` | `left:0; top:48px; bottom:0` | **rộng 68px**, cao `H − 48px` | **30** |
| `#objectives-panel` (thẻ level) | `fixed` | `top:56px; left:76px` | **rộng 256px** (`w-64`), cao tự do | **30** |
| `#view-toolbar` (thanh dưới giữa) | `fixed` | `bottom:16px; left:50%; translateX(-50%)` | rộng theo nội dung | **30** |
| `#minimap` | `fixed` | `bottom:16px; right:16px` | **180 × 140px** (canvas 180×118 + header 22) | **20** |
| `#inspector-panel` (drawer phải) | `fixed` | `top:48px; right:0; bottom:0` | **rộng 384px** (`w-96`) | **30** |
| `#incident-panel` (drawer trái) | `fixed` | `top:48px; left:0; bottom:0` | **rộng 320px** (`w-80`) | **30** |
| `#metrics-dashboard` | `fixed` | `bottom:0; left:0; right:0` | tràn ngang, trượt từ dưới | **30** |
| `#command-bar` (kubectl) | `fixed` | `bottom:0; left:0; right:0` | tràn ngang, output `max-h-64` = 256px | **50** |
| `#context-menu` | `fixed` | toạ độ chuột | theo nội dung | **50** |
| `#ingame-settings-panel` | `fixed` | `inset: 0` | toàn màn hình | **50** |
| `.drag-ghost` | `fixed` | theo con trỏ | icon 40×40 | **200** |
| `#main-menu`, `#level-select` | `fixed` | `inset: 0` | toàn màn hình, **đục** | **100** |

Ba nhận xét:

**(a) Thang z chỉ có 6 nấc: 0 → 1 → 20 → 30 → 40 → 50 → 100 → 200.** Rất ít nấc, nghĩa rõ: 20 = trang trí thụ động (minimap), 30 = panel làm việc, 40 = HUD luôn trên panel, 50 = thứ chiếm quyền input (terminal, context menu, settings), 100 = màn hình chắn, 200 = vật bay theo chuột. Ta nên chép **thang này** (không phải giá trị) và đặt tên biến — §12 hiện chưa có thang z nào, và đó là chỗ sẽ vỡ đầu tiên khi có 8 overlay.

**(b) `top: 48px` là hằng số ma lặp ở ít nhất 7 chỗ** (`#resource-palette` trong CSS; `#inspector-panel` và `#incident-panel` dưới dạng `top-12`; rồi ba lần nữa trong media query dưới dạng `36px`/`32px`/`40px`). Chiều cao HUD không phải biến ở đâu cả. Ta **phải** đặt `--game-topbar-h` và dùng `calc()` — nếu không, đổi padding thanh trên một lần là lệch bốn panel, triệu chứng là panel bị HUD che một dải mỏng, rất khó thấy.

**(c) `#objectives-panel` neo `left: 76px` = 68px rail + 8px khe.** Cùng bệnh. Ở media query 768px nó thành `left: 48px` để khớp rail 44px — khe co từ 8px xuống 4px, gần như chắc chắn là vô ý.

### 1.5 Thẻ level nằm ở đâu — đính chính so với ảnh chụp

Đề bài mô tả "thẻ level nổi ở trên-trái". Đúng, nhưng chính xác hơn: nó **kề sát rail**, không sát mép trái viewport (`left: 76px`), và **dưới HUD** (`top: 56px` = HUD 48 + khe 8). Hình học thật:

```
0        68  76                                            W-16    W
├───────────────────── #hud (cao 48) ────────────────────────────────┤  z40
├ rail ┤ ├── thẻ level, rộng 256 ──┤                                    z30
│  68  │
│  px  │              canvas thấy được ở mọi chỗ còn lại              z0
│      │
│      │        ┌ view-toolbar, giữa ngang ┐      ┌ minimap 180x140 ┐
└──────┴──────────────────────────────────────────┴──────────────────┘
                              bottom:16                bottom:16 right:16
```

Diện tích canvas *bị che* lúc nghỉ: cột rail 68px + dải HUD 48px + ba khối nhỏ. Trên 1920×1080 ước tính **~11% viewport**; phần còn lại là 3D nguyên vẹn. So với bố cục chia đôi hiện tại của ta (canvas ăn có thể 55–60% chiều ngang), đây là khác biệt kiến trúc chứ không phải trang trí — đúng như §12.1 kết luận.

### 1.6 Điều họ làm mà ta KHÔNG nên chép

**Không có container query, không có biến chiều cao, và không có bậc phóng to.** Ba media query lớn (`1440px`, `1920px`, `2560px`) **chỉ áp cho `/draw`**, vì mọi luật trong đó gác sau `body:has(#draw-canvas)`. Nghĩa là **game chính trông y hệt trên màn 1366px và trên màn 4K** — rail vẫn 68px, thẻ level vẫn 256px, minimap vẫn 180px. Trên 4K nó nhỏ đến mức khó đọc.

Đó là lỗ hổng thật, và là cơ hội rẻ cho ta: `clamp()` cho rail và thẻ level ngay từ đầu (`width: clamp(64px, 4.5vw, 96px)`) thì không bao giờ phải viết ba media query.

---

## 2. Từng vùng chrome, một cái một

### 2.1 Thanh trên (`#hud`)

**Dựng bởi:** `js/ui/HUD.js` → `createElement('div')`, `id="hud"`, class `fixed top-0 left-0 right-0 z-40 pointer-events-none`, gắn vào `document.body`.

**Vỏ ngoài:**

```html
<!-- HUD.js — upstream Apache-2.0 -->
<div class="flex items-center justify-between px-4 py-2
            backdrop-blur-xl bg-white/5 border-b border-white/10
            pointer-events-auto">
```

Dịch ra CSS thật: `backdrop-filter: blur(24px)` · `background: rgba(255,255,255,0.05)` · `border-bottom: 1px solid rgba(255,255,255,0.1)` · **không bo góc** (tràn ngang) · `padding: 8px 16px`.

Đáng chú ý: **nền là trắng 5%, không phải đen.** Trên canvas `#0d1117` rất tối, một lớp trắng mờ + blur cho cảm giác "kính" sáng hơn nền, chứ không phải "tấm che" tối hơn nền. Với theme ĐỎ của ta, `rgba(255,255,255,0.05)` vẫn dùng được và **trung tính hơn** là dùng đỏ mờ — đỏ mờ trên nền tối sẽ ám hồng toàn bộ chữ.

**Nội dung, ba cụm `justify-between`:**

*Cụm trái* — `[← Menu]` · vạch dọc `h-5 w-px bg-white/10` · chấm sức khoẻ 12px (`#hud-health`, đổi màu theo `clusterHealth`) + chữ "K8s Games" · vạch · bộ đếm sống: `Nodes N` · `Pods R/P/F` · `Deploy N` · `Svc N`.

> Chi tiết hay: **Pods là một cụm ba số chứ không phải một số.** `3/0/1` với ba màu (`text-green-400` / `text-yellow-400` / `text-red-400`, ngăn bằng `/` màu `white/20`) đọc ra ngay "3 chạy, 0 chờ, 1 hỏng" mà không cần nhãn. Nhãn `Nodes`/`Deploy`/`Svc` để `white/40`, số để `white/90` — tương phản nhãn-vs-giá-trị làm bằng **độ mờ**, không bằng cỡ chữ. Rẻ và hiệu quả, lấy được nguyên vẹn. ⚠ Nhưng ba số phân biệt **chỉ bằng màu** là vi phạm WCAG 1.4.1 — bên ta phải thêm nhãn văn bản hoặc `aria-label` cho từng số.

*Cụm giữa* (`.hud-center`) — hai đồng hồ CPU và MEM. Mỗi cái: nhãn `text-xs white/40` + thanh `flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden` chứa `<div>` fill (`bg-blue-400` cho CPU, `bg-purple-400` cho MEM) + số `%` `font-mono w-8 text-right`. Cụm `min-w-[140px]`. Chuyển động `transition-all duration-500` trên chiều rộng fill.

*Cụm phải* — đồng hồ `00:00` (`font-mono`) · vạch · nhãn chế độ `text-sky-400 uppercase tracking-wider` ("SANDBOX") · `L1` + thanh XP `w-16 h-1.5 bg-amber-400` · vạch · nút pause `▮▮` + `1x` `2x` `4x` (đang chọn: `text-sky-400 bg-sky-400/10`; còn lại `text-white/40`) · vạch · chuông `#hud-alerts` với badge `absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full` · bánh răng `#hud-settings` · vạch · badge GitHub.

**Thu gọn / đóng được không:** không. HUD luôn hiện, không có nút ẩn.

**Ở màn hẹp (≤768px)** — đây là chỗ họ làm tốt nhất trong cả file CSS. Không xuống dòng, mà **bỏ bớt theo thứ tự ưu tiên**:

```css
/* style.css @media (max-width:768px) — upstream Apache-2.0 */
#hud { height: 36px !important; font-size: 0.6rem !important; overflow: hidden !important; }
#hud > div { flex-wrap: nowrap !important; white-space: nowrap !important; }
.hud-center      { display: none !important; }  /* bỏ CPU/MEM */
.hud-extra-stat  { display: none !important; }  /* bỏ Deploy, Svc */
.hud-divider     { display: none !important; }  /* bỏ mọi vạch dọc */
.hud-github      { display: none !important; }
#hud-xp-container{ display: none !important; }
```

`flex-wrap: nowrap` + `overflow: hidden` + ẩn có chọn lọc = thanh **không bao giờ cao lên hai dòng**. Chiều cao co 48 → 36 → 32px ở ba bậc. Thứ tự hy sinh: đồng hồ tài nguyên trước, rồi thống kê phụ, rồi XP. Giữ tới cùng: Menu, Nodes, Pods, đồng hồ, tốc độ, chuông.

> **Ta nên làm khác một chỗ:** `display:none` **xoá khỏi cây a11y**. Thông tin CPU/MEM biến mất hoàn toàn với người dùng màn hẹp *và* với screen reader trên mọi màn. Với cổng axe, đường đúng là chuyển các mục bị ẩn vào một nút "Thêm" bung ra (`<details>` / popover), **không** `display:none` thẳng.

### 2.2 Rail tài nguyên trái (`#resource-palette`)

**Là markup tĩnh** trong `index.html` (không phải JS dựng) — quan trọng cho §7.

```css
/* style.css — upstream Apache-2.0 */
#resource-palette {
  position: fixed;
  left: 0; top: 48px; bottom: 0;
  width: 68px;
  z-index: 30;
  display: flex; flex-direction: column; align-items: center;
  padding: 10px 0;  gap: 2px;
  overflow-y: auto;  overflow-x: hidden;
  scrollbar-width: none;
  border-right: 1px solid rgba(50, 108, 229, 0.08);
  background: rgba(13, 17, 23, 0.92);
}
```

> Chú ý: rail **không** dùng `backdrop-filter`. Nó là nền đục 92%. Khác hẳn mọi panel còn lại. Lý do hợp lý: nó cao toàn màn hình và cuộn được, blur trên một dải cao 1000px là tốn GPU thật. **Giữ quyết định này.**

**Một ô** (`.palette-item`): `50 × 50px`, `border-radius: 10px`, `border: 1px solid transparent`, xếp dọc icon (hộp 24px, svg 20px) + nhãn (`font-size: 0.5rem` = **8px**, `max-width: 44px`, `text-overflow: ellipsis`).

Ba trạng thái:
- `:hover` → `background: rgba(50,108,229,0.1)`, `border-color: rgba(50,108,229,0.25)`, `transform: scale(1.08)`, `box-shadow: 0 0 12px rgba(50,108,229,0.1)`
- `:active` → `cursor: grabbing`, `transform: scale(0.95)`
- `.selected` → `background: rgba(50,108,229,0.2)`, `border-color: var(--k8s-blue)`, `box-shadow: 0 0 16px …, inset 0 0 8px …`

**Tooltip** (`.palette-tooltip`): `position:absolute; left:100%; top:50%; translateY(-50%); margin-left:8px`, nền đục `var(--bg-card)`, `opacity` 0→1 khi hover, `pointer-events: none`. Nội dung = tên đầy đủ + phím tắt trong `<span class="keyboard-hint">`.

> 🔴 **Tooltip chỉ hiện khi `:hover`, không khi `:focus`.** Người dùng bàn phím Tab tới ô "RS" chỉ thấy hai chữ "RS" và không bao giờ biết đó là ReplicaSet. Lỗi a11y thật, và là chỗ đầu tiên ta phải làm khác: `:hover, :focus-visible` và/hoặc `aria-describedby`.

**Nhóm:** `.palette-section-label` (`0.5rem`, `uppercase`, `letter-spacing: 0.1em`, `--text-muted`) + `.palette-separator` (vạch `32 × 1px`). Thứ tự thật trong `index.html`:

| Nhóm | Mục (nhãn ngắn) |
|---|---|
| **Workloads** | Pod · Deploy · RS · STS · DS · Job · CronJob |
| **Network** | Svc · Ingress · NetPol |
| **Config** | CM · Secret |
| **Storage** | PVC |
| **Cluster** | Node · NS · HPA · Quota |

**18 mục, 5 nhóm** — đề bài liệt kê 13 mục / 4 nhóm; nhóm **Cluster** (4 mục cuối) bị cắt khỏi ảnh chụp vì rail đã cuộn. Đó chính là vấn đề: **18 ô × 52px = 936px**, cộng 5 nhãn nhóm và 4 vạch ≈ **1.030px**, so với chiều cao khả dụng của màn 1080p là `1080 − 48 = 1032px` — sát nút. Trên laptop 1366×768 thì rail cuộn mất một phần ba số mục, mà `scrollbar-width: none` nên **không có dấu hiệu nào cho biết còn nội dung bên dưới**.

Với ta, `k8s/model.ts` có bao nhiêu kind thì rail dài bấy nhiêu — cùng cái bẫy. Hai đường ra, phải chọn trước khi lane E dựng: **(a)** chỉ hiện các kind mà level hiện tại cho phép, hoặc **(b)** nhóm gập lại được. **(a) tốt hơn về sư phạm** và upstream đã có sẵn dữ liệu cho nó (`availableResources` trong mỗi level) mà **rail không hề dùng** — level 1 chỉ cho Pod và Namespace, nhưng rail vẫn phơi cả 18 kind. Đó là một cơ hội họ bỏ lỡ và ta nhặt được gần như miễn phí.

**Ở màn hẹp:** `width` 68 → 44 → 38px; `.palette-item` 50 → 36 → 30px; **`.palette-label`, `.palette-tooltip`, `.palette-section-label` đều `display:none`**. Dưới 768px rail thành một cột icon trần: không nhãn, không tooltip, không tiêu đề nhóm. Chức năng còn, khả năng học thì mất — người mới không đoán được hình lục giác là Pod.

> §12.6 của ta nói dưới 1024px rail "thành thanh ngang cuộn được **hoặc** menu bung ra". Sau khi đo cái này tôi nghiêng hẳn về **menu bung ra**: thanh ngang gặp đúng bài toán tràn mà rail dọc đang gặp, chỉ xoay 90°, và mất chỗ cho nhãn y hệt. Menu bung ra giữ được nhãn + nhóm, và trên di động đó là thứ dùng được bằng ngón tay. Đề nghị chốt §12.6 thành một lựa chọn, không phải hai.

### 2.3 Thẻ level nổi (`#objectives-panel`)

**Markup tĩnh**, mặc định `display:none`.

```html
<!-- index.html — upstream Apache-2.0 -->
<div id="objectives-panel"
     class="fixed top-14 z-30 w-64 rounded-xl backdrop-blur-xl bg-black/60
            border border-white/10 shadow-2xl overflow-hidden
            transition-all duration-300"
     style="display:none;left:76px;">
```

Dịch ra: `top: 56px` · `left: 76px` · `width: 256px` · `border-radius: 12px` · `backdrop-filter: blur(24px)` · `background: rgba(0,0,0,0.6)` · `border: 1px solid rgba(255,255,255,0.1)` · `box-shadow` cỡ `2xl`.

> **Nền ở đây là ĐEN 60%, không phải trắng 5% như HUD.** Vì thẻ này chứa văn bản dài phải đọc được, còn HUD chỉ chứa số ngắn. Đen 60% + blur cho tương phản chữ tốt hơn hẳn. Chép **quy tắc**, không chép giá trị: *panel chứa prose thì nền tối đục hơn; panel chỉ chứa số thì nền kính nhạt*. Với cổng contrast của ta, nền tối cho khối prose là **bắt buộc**, không phải tuỳ chọn — và nhớ rằng `backdrop-blur` không đảm bảo tỉ lệ tương phản nào cả, nền canvas phía sau có thể sáng lên bất kỳ lúc nào; phải có alpha đủ đục làm sàn.

**Bốn tầng bên trong:**

1. **Header** `flex justify-between px-3 py-2 border-b border-white/8`: mũi tên `▶` `text-amber-400` + tiêu đề `#obj-panel-title` (`text-sm font-semibold text-white/90`), nút gập `#obj-panel-toggle` (`▼`, `aria-label="Toggle objectives panel"` — **panel duy nhất trong toàn upstream có `aria-label`**).
2. **Mô tả** `#obj-panel-desc`: `px-3 py-2 text-[11px] text-white/50 leading-relaxed`, viền dưới `border-white/5`.
3. **Danh sách mục tiêu** `#obj-list`: `px-3 py-2 space-y-1.5`, JS đổ vào.
4. **Khối gợi ý** `#hint-section`: nút `#btn-show-hint` chiếm hết chiều ngang (`w-full`), `text-xs font-medium`, hổ phách toàn bộ — chữ `text-amber-400/80`, nền `bg-amber-400/5`, viền `border-amber-400/15`, hover đậm lên từng nấc (`/10`, `/30`), `rounded-lg`, icon bóng đèn 14px. Dưới nó là `#hint-list`.

**Gập được:** có (nút `▼` ẩn `#obj-panel-body`, giữ header). **Đóng hẳn:** không.

**Ở màn hẹp (≤768px):** `left: 48px`, `top: 40px`, `width: auto`, `max-width: calc(100vw - 56px)`, `min-width: 180px`, `max-height: 45vh` + `overflow-y: auto`, và **`#obj-panel-desc { display: none }`** — phần văn xuôi dạy khái niệm biến mất trên di động.

> Với ta đó là mất mát không chấp nhận được: `primer` và `takeaways` **là sản phẩm**, không phải trang trí. Đường đúng: giữ prose nhưng thu vào `<details>` đóng sẵn. Ghi rõ vào §12.6.

### 2.4 Thanh công cụ dưới-giữa (`#view-toolbar`)

**Markup tĩnh.** `fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-2xl`.

`bottom: 16px`, căn giữa bằng `left:50% + translateX(-50%)`, `border-radius: 12px`, nền **trắng 5% + blur 24px** (giống HUD, khác thẻ level).

**Năm phần tử, ngăn bằng vạch dọc `w-px h-5 bg-white/10`:**

| Phần tử | id | Hover |
|---|---|---|
| **Auto-Align** | `btn-auto-align` | `hover:bg-sky-500/20 hover:border-sky-400/40` |
| **Reset View** | `btn-reset-camera` | `hover:bg-white/10` |
| **YAML** | `btn-export-yaml` | `hover:bg-white/10` |
| *(vạch)* `/ kubectl` | — | **không phải nút** — là nhãn `<kbd>/</kbd> kubectl` màu `white/30`, chỉ nhắc phím |
| **Help** | `btn-help` | `hover:bg-amber-500/20 hover:border-amber-400/40` |

> **Đính chính đề bài: "kubectl" trên thanh này không bấm được.** Nó là chú thích phím tắt, không phải nút. Muốn mở terminal phải gõ `/`. Đó là lỗi khả dụng — người dùng chuột thấy nó nằm giữa hai nút thật, trông giống nút, bấm thì không có gì xảy ra. Với cổng bàn phím của ta, ta **phải** biến nó thành `<button>` thật mở terminal, kèm `<kbd>/</kbd>` như phím tắt phụ.

Màu hover mã hoá loại hành động: xanh dương = biến đổi bố cục, trắng = trung tính, hổ phách = trợ giúp. Nhất quán với thẻ level (gợi ý cũng hổ phách). **Quy ước này đáng lấy**: hổ phách = "trợ giúp/gợi ý" ở mọi nơi.

**Ở màn hẹp:** bỏ căn giữa (`left: 48px; transform: none`), `bottom: 6px`, `max-width: calc(100vw - 56px)`, `overflow-x: auto` + ẩn scrollbar, **`button span { display:none }`** và `font-size: 0` → **chỉ còn icon**, nút co về `min-width: 28px`. `<kbd>` bị ẩn.

> Nút chỉ-icon không nhãn là một trong những lỗi axe bắt thường xuyên nhất (`button-name`). Upstream thoát vì các nút này **có `title=`**, nhưng `title` không phải accessible name đáng tin (không đọc trên nhiều screen reader, không hiện với bàn phím). Ta dùng `aria-label` cố định + `<span class="sr-only">`.

### 2.5 Minimap (`#minimap`)

JS dựng (`js/ui/Minimap.js`), gắn thẳng `body`, class `fixed bottom-4 right-4 z-20`.

```html
<!-- Minimap.js — upstream Apache-2.0 -->
<div class="backdrop-blur-xl bg-white/5 border border-white/10 rounded-lg
            overflow-hidden shadow-xl" style="width: 180px; height: 140px;">
  <div class="flex items-center justify-between px-2 py-1 border-b border-white/5">
    <span class="text-white/30 text-[10px] font-mono">Cluster Map</span>
    <button id="minimap-toggle" class="text-white/20 hover:text-white/40 text-[10px]">-</button>
  </div>
  <canvas id="minimap-canvas" style="width: 180px; height: 118px;"></canvas>
</div>
```

`border-radius: 8px` (`rounded-lg`, nhỏ hơn thẻ level 12px), `shadow-xl` (nhẹ hơn `2xl`), `z-20` — nấc thấp nhất trong các overlay. Nội dung là **canvas 2D thứ hai** (`getContext('2d')`), scale theo `devicePixelRatio`, chạy `requestAnimationFrame` riêng, vẽ lại theo `tick` + `incident:created` + `incident:resolved` + `viewport:change`.

**Tương tác:** `mousedown`/`mousemove`/`mouseup` trên canvas — kéo để dời viewport. Nút `-`/`+` gập: `canvas.style.display = 'none'`, đổi nhãn, giữ header 22px.

**Ở màn hẹp:** `display: none` hoàn toàn.

> Đây là vùng **canvas-only** duy nhất trong toàn bộ chrome, và là chỗ ta chắc chắn phải làm khác — xem §7. Ghi nhận thêm: nút gập là `<button>` trần chứa ký tự `-`, không `aria-label`, nội dung đổi giữa `-` và `+`. Screen reader đọc ra "dấu trừ".

### 2.6 Inspector — drawer phải (`#inspector-panel`)

JS dựng: `fixed top-12 right-0 w-96 bottom-0 z-30 transform translate-x-full transition-transform duration-300 ease-out`.

**Đây là drawer, không phải modal.** Cơ chế: luôn ở trong DOM, luôn `fixed` chiếm cột phải 384px, nhưng dịch `translateX(100%)` ra ngoài màn. Mở = bỏ class `translate-x-full`. Chuyển động 300ms `ease-out`. **Không có backdrop, không chặn canvas** — người chơi vẫn xoay camera trong lúc inspector mở.

Vỏ trong: `h-full flex flex-col backdrop-blur-xl bg-white/5 border-l border-white/10 shadow-2xl`. Không bo góc (dính mép phải, chạy hết chiều cao).

**Ba tầng:**
1. **Header** `px-4 py-3`: ô icon `w-8 h-8 rounded-lg` màu theo kind (ví dụ `bg-sky-500/20 text-sky-400`) chứa **một chữ cái** (`P` cho Pod) · tên `text-sm font-semibold truncate` · phụ đề `text-xs text-white/40 truncate` · nút `Edit` (ẩn tuỳ kind) · nút `×`.
2. **Tabs** `flex border-b border-white/5 px-2`: **Overview · YAML · Events · Describe**. Tab chọn: `text-sky-400 border-b-2 border-sky-400`; tab thường: `text-white/40 border-b-2 border-transparent`.
3. **Body** `flex-1 overflow-y-auto p-4`.

> Bốn tab này ánh xạ thẳng sang bốn thứ người ta thật sự làm với `kubectl`: `get -o wide`, `get -o yaml`, `get events`, `describe`. Quyết định sư phạm tốt và **rẻ để chép**: cùng một dữ liệu, bốn cách trình bày, mỗi cách dạy một lệnh. Lấy nguyên cấu trúc này. ⚠ Nhưng tab của họ là `<button>` trần không `role="tab"`, không `aria-selected`, không điều hướng bằng mũi tên — ta phải dựng đúng ARIA tabs pattern.

### 2.7 Incident panel — drawer trái (`#incident-panel`)

Đối xứng gương với inspector: `fixed top-12 left-0 w-80 bottom-0 z-30 transform -translate-x-full`. Rộng **320px**, trượt từ trái, cũng có tab (`flex-1` nên tab chia đều chiều ngang, khác inspector).

> ⚠ **Nó chồng lên rail 68px và lên thẻ level.** Cả ba đều `z-30`, nên thứ tự do thứ tự DOM quyết định — incident panel gắn `body` *sau* `#game-container`, nên nó thắng và phủ hẳn lên rail. Ở màn hẹp họ vá bằng `left: 48px !important` để né rail, nhưng **ở màn rộng thì không né**. Đây là bug bố cục thật, không phải chủ ý.

Bài học cho ta: hai drawer đối diện + một rail cố định + một thẻ nổi ở cùng `z` là công thức va chạm. Cần **luật loại trừ** ghi vào §12.5: mở drawer trái thì thẻ level tự thu về header, và drawer trái bắt đầu từ `left: var(--rail-w)` chứ không từ 0.

### 2.8 Metrics dashboard (`#metrics-dashboard`)

`fixed bottom-0 left-0 right-0 z-30 transform translate-y-full transition-transform duration-300`. Cùng cơ chế drawer, hướng dưới. Bật/tắt bằng phím `M`. Ở màn hẹp: `left: 48px` để né rail.

### 2.9 Terminal kubectl (`#command-bar`)

`fixed bottom-0 left-0 right-0 z-50 transform translate-y-full transition-transform duration-300 ease-out`. **`z-50`, cao hơn mọi panel khác** — hợp lý, nó chiếm bàn phím.

```html
<!-- CommandBar.js — upstream Apache-2.0 -->
<div class="backdrop-blur-xl bg-white/5 border-t border-white/10 shadow-2xl">
  <div class="flex items-center justify-between px-4 py-2 border-b border-white/5">
    <span class="text-white/40 text-xs font-mono">Terminal</span>
    <span class="text-white/20 text-xs">Press / to toggle</span>  <!-- + nút × -->
  </div>
  <div id="cmd-output" class="px-4 py-2 max-h-64 overflow-y-auto font-mono text-sm"></div>
  <div class="relative px-4 py-3 border-t border-white/5">
    <span class="text-green-400 text-sm font-mono shrink-0">$ kubectl</span>
    <input id="cmd-input" class="flex-1 bg-transparent font-mono outline-none
           placeholder:text-white/20" placeholder="enter command..."
           autocomplete="off" spellcheck="false" />
  </div>
  <div id="cmd-suggestions" class="absolute bottom-full left-0 right-0 hidden"></div>
</div>
```

Ba tầng: thanh tiêu đề → **output cuộn được, trần 256px** → dòng nhập. Prompt `$ kubectl` là **văn bản cố định ngoài `<input>`**, nên người chơi chỉ gõ phần sau — vừa bớt gõ vừa dạy rằng mọi lệnh đều bắt đầu bằng `kubectl`. Gợi ý autocomplete bung **lên trên** (`bottom-full`), không xuống dưới, vì thanh đã dính đáy.

> Chi tiết `spellcheck="false"` + `autocomplete="off"` nhỏ nhưng bắt buộc — thiếu nó thì trình duyệt gạch chân đỏ mọi tên tài nguyên. Ta hay quên cái này.

### 2.10 Bảng tổng hợp style — để lane E tra nhanh

| Vùng | nền | blur | viền | bo góc | bóng |
|---|---|---|---|---|---|
| HUD | `rgba(255,255,255,.05)` | 24px | dưới `rgba(255,255,255,.1)` | 0 | — |
| Rail | `rgba(13,17,23,.92)` | **không** | phải `rgba(50,108,229,.08)` | 0 | — |
| Thẻ level | `rgba(0,0,0,.6)` | 24px | `rgba(255,255,255,.1)` | 12px | `2xl` |
| Thanh công cụ | `rgba(255,255,255,.05)` | 24px | `rgba(255,255,255,.1)` | 12px | `2xl` |
| Minimap | `rgba(255,255,255,.05)` | 24px | `rgba(255,255,255,.1)` | 8px | `xl` |
| Inspector | `rgba(255,255,255,.05)` | 24px | trái `rgba(255,255,255,.1)` | 0 | `2xl` |
| Terminal | `rgba(255,255,255,.05)` | 24px | trên `rgba(255,255,255,.1)` | 0 | `2xl` |

Quy luật rút ra, và nó nhất quán một cách có chủ ý:

1. **Dính mép → không bo góc; nổi giữa → bo 8–12px.** Bán kính tỉ lệ với mức "nổi": minimap (nhỏ, phụ) 8px, thẻ level và thanh công cụ (chính) 12px.
2. **Chứa prose → nền đen đục; chứa số/điều khiển → nền trắng kính.** Đúng một ngoại lệ là rail, và nó có lý do hiệu năng.
3. **Chỉ một giá trị blur cho tất cả: 24px.** Không có bậc blur. Đơn giản và đúng — nhiều bậc blur không phân biệt được bằng mắt nhưng nhân đôi chi phí GPU.
4. **Viền luôn `rgba(255,255,255,0.1)`, một giá trị duy nhất**, chỉ đổi *cạnh nào* có viền tuỳ mép nào đang dính.

Ta chép được cả bốn quy luật này với bảng màu đỏ mà không sửa gì về cấu trúc — chỉ thay `rgba(255,255,255,.05)` bằng token kính của ta và giữ nguyên hình học.

---

## 3. Mô hình tương tác

### 3.1 Đặt một tài nguyên — CẢ HAI đường, không phải một

Đề bài hỏi kéo-thả hay bấm-rồi-bấm hay bấm-để-sinh. Câu trả lời đo được: **họ làm cả hai, và hai đường dẫn tới hai vị trí khác nhau.**

**Đường A — kéo thả.** Mỗi `.palette-item` có `draggable="true"`. Rail bắt `dragstart` → lưu `dataset.resource`, `dataTransfer.setData('text/plain', kind)`, và tạo `.drag-ghost` (bản sao icon, `filter: drop-shadow(0 0 12px var(--k8s-blue))`, 40×40, `z-index: 200`) làm `setDragImage`. Canvas bắt `dragover` (`dropEffect='copy'`) và `drop` → `placeResource(kind, e.clientX, e.clientY)`. Toạ độ thả được chiếu xuống mặt đất bằng `renderer.screenToGround(x, y)` — raycast vào `THREE.Plane(0,1,0)`. **Vật rơi đúng chỗ con trỏ.**

**Đường B — bấm một lần.** Rail cũng bắt `click`: lấy tâm canvas (`rect.left + rect.width/2`, `rect.top + rect.height/2`) rồi gọi cùng `placeResource`. **Vật rơi giữa màn hình**, không phải nơi con trỏ.

Không có đường "bấm-rồi-bấm-vào-canvas". Phím số `1`–`9` gọi `selectPaletteResource(kind)` chỉ **tô sáng** ô rail (thêm class `.selected`) và đặt `this.selectedResource` — **nhưng không có code nào đọc `this.selectedResource` ở đường đặt tài nguyên.** Biến được ghi, không được đọc. Nghĩa là **phím số hiện tại không tạo được gì**; nó chỉ đổi màu một ô.

> 🔴 Đây là phát hiện quan trọng nhất của §3 cho ta. Bố cục toàn màn hình của họ **không hề có đường đặt tài nguyên bằng bàn phím**. Phím số trông như có, nhưng chết. Đường duy nhất còn lại cho người dùng bàn phím là gõ `kubectl` ở terminal — và đó là đường đi được (xem §7).
>
> Với AC bàn phím của ta, **đường B (bấm một lần → rơi giữa màn) chính là thứ ta cần**, chỉ cần trigger là activation của `<button>` thật (`click` đã bao gồm Enter/Space trên `<button>`). Của họ là `<div>` nên hỏng. Đổi `.palette-item` từ `div` sang `button` sửa được cả hai lỗi cùng lúc.

**Sau khi thả, một modal chặn đường.** `placeResource` **không** tạo ngay: nó gọi `_showNamePrompt(kind, callback)` — overlay `fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm` chứa hộp `w-72 rounded-xl bg-gray-900/95 border border-white/10 shadow-2xl p-4`:

- nhãn `Create ${kind}` (`text-xs uppercase tracking-wider text-white/40`)
- `<input>` `font-mono`, `spellcheck="false"`, giá trị mặc định điền sẵn, kèm `input.select()` + `input.focus()`
- một hàng nút gợi ý tên **lấy từ objective của level hiện tại** (`_getNameSuggestions` đọc `modeInstance.getStatus().objectives`)
- `[Create]` `[Cancel]`
- dòng mẹo: *"Name must match the objective"*

`Enter` = tạo, `Escape` = huỷ (và **giảm bộ đếm tên** lại, nên không thủng số thứ tự).

> Chi tiết đáng lấy: **gợi ý tên rút từ objective.** Nó biến bước gõ tên — vốn là ma sát thuần tuý — thành gợi ý sư phạm. Người chơi thấy ngay "à, objective đang đòi một Deployment tên `frontend`".
>
> Chi tiết KHÔNG nên lấy nguyên: overlay này **không bẫy focus**. Tab từ `[Cancel]` đi thẳng ra rail phía sau, trong khi backdrop vẫn chặn chuột. Ta phải dùng `<dialog>` native hoặc bẫy focus thủ công.

**Hai modal nối tiếp cho vài kind.** Tạo `Service` → mở tiếp `_showSelectorPicker`; tạo `Ingress` → mở tiếp `_showIngressPathPicker`. Một thao tác kéo-thả có thể sinh **hai hộp thoại liên tiếp**. Chấp nhận được vì cả hai đều dạy đúng khái niệm (selector, path rule), nhưng cần cẩn thận về nhịp.

### 3.2 Chọn và soi một đối tượng

Toàn bộ nằm ở `ClusterRenderer` với `THREE.Raycaster`, và có một chi tiết kỹ thuật đáng chép:

**Phân biệt bấm với kéo bằng ngưỡng 4px.** `mousedown` ghi `_clickStart` và raycast ngay để tìm `_dragCandidate`. `mousemove` tính khoảng cách; chỉ khi `dist > 4` mới chuyển sang chế độ kéo (`_draggingResource`, tắt `controls`, đổi con trỏ sang `grabbing`). `mouseup` mà `_didDrag === false` thì đó là bấm → `_setSelected(uid)`.

Nhờ vậy một cử chỉ chuột phục vụ **ba việc** không xung đột: bấm = chọn, kéo trên vật = di chuyển vật, kéo trên nền = xoay camera. Đó là lý do bố cục toàn màn hình dùng được mà không cần thanh chọn chế độ.

**Hover:** `_performPick(false)` chạy **mỗi khung hình** trong `_animate()` (chỉ bỏ qua khi đang kéo) — raycast 60 lần/giây. Với 18 kind × N instance thì đây là chi phí thật. Bên ta đã có §11 về hiệu năng, nên ghi nhận: **hover picking mỗi frame là một trong những nguồn giật rẻ nhất để bỏ**; chỉ raycast khi chuột thật sự di chuyển.

**Chuỗi sự kiện khi chọn:** `_setSelected(uid)` → `onSelect(uid)` → engine `emit('resource:selected', {uid})` → `InspectorPanel._onResourceSelected` → `this.show()` (bỏ `translate-x-full`) + render 4 tab. Bấm nền trống → `_setSelected(null)` → inspector đóng.

**Chuột phải** → `resource:contextmenu` kèm toạ độ màn hình → `#context-menu` (`fixed z-50`) hiện tại chỗ. Menu khác nhau theo kind; mỗi mục hiển thị phím tắt bên phải (`text-white/20 text-[10px] ml-4`) và **bắt phím thật khi menu đang mở**.

### 3.3 YAML — hai thứ khác nhau bị gọi cùng một tên

Chỗ này đề bài (và ảnh chụp) dễ hiểu nhầm. Upstream có **hai** đường YAML, không liên quan nhau:

| | Nút **YAML** trên thanh dưới | Tab **YAML** trong inspector |
|---|---|---|
| id | `#btn-export-yaml` | `[data-tab="yaml"]` |
| Hành vi | gom `toYAML()` của **mọi** resource, nối bằng dấu `---`, tạo `Blob` → `a.download = 'k8sgames-cluster.yaml'` → `a.click()` | render YAML của **một** resource vào thân drawer |
| Là gì | **tải file xuống**, không mở giao diện nào | **một tab trong drawer**, không phải modal |

**Không có modal YAML nào cả.** Không có drawer YAML riêng. Xem YAML = chọn vật + bấm tab; xuất YAML = tải file. Trả lời trực tiếp câu hỏi đề bài: **panel (tab trong drawer), không phải modal, không phải drawer riêng.**

> Tách hai chức năng ra hai chỗ là đúng, nhưng **đặt cả hai dưới cùng chữ "YAML" là sai** — hai hành vi hoàn toàn khác nhau. Đề nghị: nút thanh dưới đổi thành "Xuất YAML" (hoặc icon tải xuống), tab giữ "YAML".
>
> Về AC bàn phím: `a.click()` để tải file **hoạt động tốt** với bàn phím; tab thì cần ARIA tabs (§2.6).

### 3.4 Terminal kubectl mở thế nào

**Phím `/`** — bắt ở **hai** nơi độc lập, và đó là một bug nhỏ:

- `CommandBar._onGlobalKeydown`: `if (e.key === '/' && !this.visible …) this.show()`, có guard `activeElement.tagName === 'INPUT'/'TEXTAREA'`.
- `index.html bindKeyboard()`: `case '/': this.commandBar.toggle()`, guard tương tự trên `e.target`.

Hai listener cùng nghe `document`, cùng phím: một cái `show()`, một cái `toggle()`. Kết quả phụ thuộc thứ tự đăng ký listener — đúng loại bug không tái hiện ổn định. Ta chỉ đăng ký **một** chỗ.

**Không có nút mở bằng chuột** (§2.4). Đóng: `Escape` hoặc nút `×`.

**Output đi đâu:** `#cmd-output` ngay trong thanh, `max-h-64` (256px), `overflow-y-auto`, `font-mono text-sm`. Không cửa sổ log riêng, không toast. Terminal là khối tự chứa: nhập ở dưới, ra ở trên, cuộn tại chỗ.

### 3.5 Toàn bộ phím tắt tìm được trong source

Bốn nguồn: `index.html bindKeyboard()` (~dòng 765), `CommandBar.js`, `ContextMenu.js`, `MetricsDashboard.js`. Guard chung: bỏ qua nếu `e.target.tagName` là `INPUT` hoặc `TEXTAREA`.

**Toàn cục (khi không có ô nhập nào đang focus):**

| Phím | Hành động | Nguồn |
|---|---|---|
| `/` | mở/đóng terminal kubectl | `bindKeyboard` + `CommandBar` (trùng, §3.4) |
| `Space` | tạm dừng / chạy tiếp | `bindKeyboard` |
| `M` / `m` | bật/tắt metrics dashboard | `bindKeyboard` + `MetricsDashboard` (**cũng trùng**) |
| `Escape` | đóng theo thứ tự: settings/achievements/stats → inspector → về menu chính | `bindKeyboard.handleEscape` |
| `Delete` / `Backspace` | xoá tài nguyên **đang chọn** | `bindKeyboard` |
| `?` / `h` / `H` | mở tutorial/trợ giúp | `bindKeyboard` |
| `1` | chọn Pod trên rail | `bindKeyboard` |
| `2` | chọn Deployment | |
| `3` | chọn ReplicaSet | |
| `4` | chọn StatefulSet | |
| `5` | chọn DaemonSet | |
| `6` | chọn Job | |
| `7` | chọn CronJob | |
| `8` | chọn Node | |
| `9` | chọn Namespace | |

> `1`–`9` chỉ tô sáng ô, **không tạo tài nguyên** (§3.1). Và chỉ phủ 9 trong 18 kind — Service, Ingress, NetworkPolicy, ConfigMap, Secret, PVC, HPA, Quota không có phím nào.

**Trong ô nhập của terminal:**

| Phím | Hành động |
|---|---|
| `Enter` | chạy lệnh, hoặc nhận gợi ý đang chọn |
| `Tab` | tab-complete |
| `ArrowUp` / `ArrowDown` | duyệt lịch sử lệnh / duyệt gợi ý |
| `Escape` | đóng terminal |

**Trong modal đặt tên / sửa:** `Enter` = xác nhận, `Escape` = huỷ.

**Khi context menu đang mở** (bắt tại `ContextMenu._onKeydown`, so khớp không phân biệt hoa thường):

| Phím | Hành động | Áp cho kind |
|---|---|---|
| `Escape` | đóng menu | mọi kind |
| `L` | View Logs | Pod |
| `D` | Describe | **mọi kind** |
| `E` | Exec Into (Pod) / View Endpoints (Service) | **xung đột nghĩa theo kind** |
| `F` | Port Forward | Pod |
| `S` | Scale | Deployment |
| `R` | Restart | Deployment |
| `B` | Rollback | Deployment |
| `T` | Top | Node |
| `C` | Cordon | Node |
| `U` | Uncordon | Node |
| `N` | Drain | Node |
| `Del` / `Backspace` | Delete (đánh dấu `danger: true`) | mọi kind |

**Không tồn tại:** không có phím nào để **di chuyển focus giữa các vật trong scene 3D**, không có phím chọn vật kế tiếp, không có phím mở inspector, không có phím mở rail, không có phím đóng thẻ level. Toàn bộ việc *chọn* một đối tượng chỉ làm được bằng chuột.

> Đó là lỗ hổng cấu trúc, không phải chi tiết bỏ sót, và nó dẫn thẳng vào §7.

---

## 4. Cảnh 3D

### 4.1 Camera — phối cảnh, không đẳng cự

```js
// ClusterRenderer.js — upstream Apache-2.0
new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
camera.position.set(18, 14, 18);   camera.lookAt(0, 0, 0);
```

**Phối cảnh, FOV 45°, đặt ở `(18, 14, 18)`** — tức góc phương vị 45° và góc ngẩng `atan(14 / (18√2)) ≈ 28,8°` so với mặt phẳng ngang. Đó là góc "isometric-ish" quen thuộc của game xây dựng, nhưng **không** phải orthographic thật.

> Đây là một quyết định đáng bàn với lane E chứ không phải chép ngay. Phối cảnh cho chiều sâu và cảm giác vật thể có khối; đẳng cự cho lưới đọc được và khoảng cách không bị bóp méo. Họ chọn phối cảnh, và với `fog` + shadow thì nó đẹp thật. Nhưng phối cảnh làm **nhãn tên ở xa nhỏ đi**, và với chữ tiếng Việt có dấu thì đó là vấn đề đọc được thật sự. Nếu ta dùng sprite label như họ, cân nhắc đẳng cự; nếu ta dùng nhãn DOM chiếu ra (khuyến nghị, vì nó đọc được và **focus được** — §7.3), thì phối cảnh không sao.

`OrbitControls` với: `enableDamping: true`, `dampingFactor: 0.08`, `minDistance: 5`, `maxDistance: 80`, `maxPolarAngle: π/2.1` (**chặn không cho chui xuống dưới mặt đất** — chi tiết nhỏ nhưng bắt buộc), `minPolarAngle: 0.1`. Nút chuột: **trái = xoay, giữa = zoom, phải = pan**. Cảm ứng: một ngón xoay, hai ngón zoom+pan.

> ⚠ Chuột phải = pan **xung đột với context menu**. Họ `preventDefault()` trên `contextmenu` và tự dựng menu, nên khi bấm phải trên một vật thì vừa pan vừa mở menu. Ta nên đổi: **phải = context menu, giữa hoặc Shift+trái = pan**.

`resetCamera()` chỉ đặt lại `position` và `target` — **không có chuyển động bay**, nó nhảy cóc tức thì. Chỗ này thêm một tween 400ms là cải thiện rõ với chi phí gần bằng không.

### 4.2 Ánh sáng — năm nguồn, và đó là lý do nó trông "được thiết kế"

| Nguồn | Màu | Cường độ | Vị trí |
|---|---|---|---|
| `AmbientLight` | `0x8899bb` (xanh lạnh) | 0.7 | — |
| `HemisphereLight` | trời `0x88aaff` / đất `0x222244` | 0.4 | — |
| `DirectionalLight` (chính) | `0xffffff` | 1.2 | `(20, 40, 20)`, **đổ bóng** |
| `DirectionalLight` (rim) | `0x326CE5` (xanh K8s) | 0.4 | `(-15, 10, -15)` |
| `DirectionalLight` (fill) | `0x446688` | 0.3 | `(-10, 5, 20)` |

Đây chính là điều §9.1 của ta gọi là "bốn thứ quyết định 80% cảm giác được thiết kế", và upstream làm đúng: **key + fill + rim, ba nguồn có màu khác nhau**. Rim light màu thương hiệu chiếu từ sau-trái là thứ tạo viền sáng quanh mọi khối — rẻ, và nó gánh phần lớn "vẻ đẹp" mà chủ dự án nhìn thấy trong ảnh chụp.

**Với theme ĐỎ của ta, rim light phải đổi sang token đỏ.** Đó là chỗ chuyển thương hiệu rẻ nhất và hiệu quả nhất trong cả scene — một dòng, và toàn bộ cảnh đổi tông.

Renderer: `antialias: true`, `pixelRatio: min(devicePixelRatio, 2)`, `shadowMap: PCFSoftShadowMap`, **`toneMapping: ACESFilmic`, `exposure: 1.2`**. Shadow map 2048×2048, camera bóng phủ ±40.

> `ACESFilmicToneMapping` + exposure 1.2 là lý do màu không bị "cháy" khi có nhiều emissive. Nếu ta bỏ tone mapping mà giữ emissive, mọi thứ sẽ bệt trắng. Ghi vào hợp đồng C6.

### 4.3 Lưới và nền

`GRID_SIZE = 40`, `GRID_DIVISIONS = 20` → **ô lưới 2 đơn vị**, tổng 40×40. Ba lớp:

1. **Lưới** — `LineSegments` màu `0x326CE5`, `opacity: 0.1`. Dựng thủ công bằng `BufferGeometry` chứ không dùng `THREE.GridHelper`.
2. **Hai trục** — cùng màu, `opacity: 0.25` (đậm hơn lưới 2,5×), chạy qua gốc theo X và Z. Cho một điểm neo thị giác.
3. **Mặt đất** — `PlaneGeometry(60, 60)` (lưới × 1.5), `MeshStandardMaterial` màu `0x0a0e14`, **`metalness: 0.9`, `roughness: 0.2`**, `opacity: 0.15`, đặt tại `y = -0.1`, `receiveShadow`.

> Mặt đất **kim loại bóng, gần như trong suốt** là mẹo hay: nó bắt highlight của các nguồn sáng nên nền không phải một mảng đen chết, mà bóng vẫn đổ lên được. `metalness 0.9 + roughness 0.2 + opacity 0.15` — ba số này đi với nhau, đổi một cái là mất hiệu ứng.

`scene.fog = FogExp2(0x0d1117, 0.006)` cùng màu nền → mọi thứ ở xa tan vào nền thay vì bị cắt cụt ở rìa lưới. Rẻ, và nó là thứ làm cho lưới 40×40 trông như vô tận.

### 4.4 Node được vẽ thế nào

Đúng như ảnh chụp: **một tấm bục nâng có mấy khối lập phương nhỏ trên mặt**.

```js
// ResourceMeshes.js — upstream Apache-2.0
const platformGeom = new THREE.BoxGeometry(3.0, 0.4, 2.2);   // bục
// viền: EdgesGeometry + LineBasicMaterial màu K8S_BLUE, opacity 0.6
// 3 "chip": BoxGeometry(0.35, 0.12, 0.35), màu 0x58a6ff,
//           emissive 0x326CE5 @0.3, đặt tại x = -0.6 + i*0.6, y = 0.26
// đèn trạng thái: SphereGeometry(0.18) màu theo status, tại (-1.2, 0.38, -0.8)
// nhãn: sprite text tại y = 0.9
```

Bốn thành phần: **bục 3,0 × 0,4 × 2,2** (màu `0x30363d`, `metalness 0.5`, `roughness 0.5`) + **viền cạnh sáng** (`EdgesGeometry`, xanh K8s, opacity 0.6) + **3 chip** phát sáng nhẹ + **một quả cầu đèn trạng thái** ở góc + nhãn tên nổi phía trên.

> Viền `EdgesGeometry` là chi tiết dễ bỏ qua nhưng gánh nhiều: nó biến một hộp xám thành một vật "có kỹ thuật". Chi phí một `LineSegments` cho mỗi node.
>
> Cái không có, và ta cần: **node không hề biểu diễn sức chứa.** Bục luôn 3,0 × 2,2 bất kể node 4 CPU hay 16 CPU, và không có gì cho thấy nó đã đầy. Với bài học về quota/scheduling của ta, đó là thông tin phải thấy được — ví dụ bục dài ra theo CPU, hoặc một vòng tiến độ dưới chân.

Màu trạng thái vào qua `createStandardMaterial(color, status)` → `emissive` = màu trạng thái, `emissiveIntensity: 0.25`. Tức là **trạng thái mã hoá bằng ánh sáng phát ra, không bằng màu bề mặt**. Sạch, và nó cho phép màu bề mặt giữ nguyên bản sắc theo kind.

### 4.5 Pod được vẽ thế nào, và đặt ở đâu

**Khối lục giác đùn** (`hexShape(0.6)` + `ExtrudeGeometry` depth 0.5, có vát cạnh `bevelThickness/Size = 0.05`, 2 phân đoạn) — đúng hình logo Kubernetes. Kèm: một đĩa sáng dưới chân (`CircleGeometry(0.7, 6)`, màu theo status, opacity 0.15), một `createGlowRing` (`RingGeometry` 0.4→0.6, opacity 0.15), và nhãn tên tại `y = 0.8`.

**Chuyển động:** pod **bồng bềnh**, và đây là dòng đáng chú ý nhất trong cả renderer:

```js
// ClusterRenderer._animateResources — upstream Apache-2.0
group.position.y = (group.userData.baseY || 0)
                 + Math.sin(time * 2 + id.charCodeAt(0)) * 0.08;
```

Lệch pha bằng **mã ký tự đầu của uid**. Thủ thuật rẻ tiền và hiệu quả: mọi pod bồng bềnh cùng tần số nhưng khác pha, nên trông "sống" chứ không trông như một khối đồng bộ. Biên độ 0,08 đơn vị — rất nhỏ, cố ý.

> **Nhưng vị trí pod thì KHÔNG gắn với node.** Tôi tìm cả `ClusterRenderer` lẫn `index.html`: không có code nào đặt pod *lên trên* node. Pod nằm ở nơi người chơi thả, hoặc ở vị trí do `getPlacementPosition()` sinh ra, hoặc ở nơi `autoAlignResources()` xếp theo tier. Quan hệ pod↔node **chỉ thể hiện bằng đường nối**, không bằng vị trí.
>
> Đó là một mất mát sư phạm lớn với ta. "Pod chạy TRÊN node" là khái niệm nền tảng, và nó hoàn toàn biểu diễn được bằng không gian: pod xếp thành lưới trên mặt bục node. Khi node chết, mọi pod trên đó rơi/tái phân bố — hình ảnh đó dạy `NodeNotReady` mạnh hơn bất kỳ đoạn văn nào. **Đề nghị: pod bị ràng buộc vị trí vào node của nó, không thả tự do.** Đây là chỗ ta nên khác họ một cách có chủ ý.

### 4.6 Đường nối

`QuadraticBezierCurve3` từ nguồn tới đích, **điểm giữa nâng lên `min(distance × 0.3, 3)`** — nên đường cong thành vòm, càng xa càng cao nhưng chặn ở 3 đơn vị. 32 phân đoạn. `LineDashedMaterial` với `dashSize 0.3 / gapSize 0.15`.

Màu theo **loại quan hệ**, không theo trạng thái:

| Loại | Màu | Nghĩa |
|---|---|---|
| `ownership` | `0xc9d1d9` (xám sáng) | Deployment → ReplicaSet → Pod |
| `network` | `0x58a6ff` (xanh sáng) | Service → Pod, Ingress → Service |
| `storage` | `0x8b949e` (xám) | PVC → Pod |
| `config` | `0xd29922` (vàng) | ConfigMap/Secret → Pod |
| mặc định | `0x6e7681` | — |

Độ mờ **tỉ lệ với lưu lượng**: `opacity = min(0.25 + trafficVolume × 0.05, 0.7)`. Đường bận thì đậm hơn.

> **Bốn màu quan hệ này rất đáng lấy nguyên.** Nó trả lời một câu hỏi mà biểu đồ K8s nào cũng vấp: một Pod có thể đồng thời bị sở hữu, được phục vụ, gắn volume và nạp config — bốn đường tới cùng một vật. Phân biệt bằng **màu theo loại quan hệ** (chứ không theo trạng thái) giải quyết gọn. Với theme đỏ, chỉ cần đảm bảo bốn màu này không đụng dải đỏ thương hiệu — xám/xanh/vàng thì an toàn.
>
> ⚠ Nhưng phân biệt **chỉ bằng màu** lại vi phạm WCAG 1.4.1 lần nữa. Trong 3D thì không tránh được bằng DOM, nên đường DOM tương đương (§7.3) phải nói ra loại quan hệ bằng **chữ**: "Pod `web-1` — thuộc ReplicaSet `web-abc`, được Service `web-svc` phục vụ, gắn PVC `data`".

Nét đứt còn "chảy" (`FLOW_SPEED = 2.0` dịch `dashOffset`) để chỉ hướng.

### 4.7 Hạt lưu lượng

Hệ hạt GPU với **`POOL_SIZE = 2048`**, shader tự viết (`gl_PointSize = size × (200 / -mvPosition.z)` — co theo chiều sâu), `SPAWN_INTERVAL = 0.05` s, tốc độ ngẫu nhiên 1,5–4,0, đuôi 3 điểm, fade in 0,15 và fade out từ 85% quãng đường.

Bốn màu lưu lượng: `healthy 0x3fb950` · `error 0xf85149` · `slow 0xd29922` · `default 0x58a6ff`.

> Pool cố định 2048 hạt cấp phát một lần là đúng cách (không `new` trong vòng lặp render). Nhưng 2048 hạt với `SPAWN_INTERVAL` 0,05 s cho mỗi đường nối là **nhiều** — với §11 của ta thì đây phải là thứ đầu tiên bị tắt ở bậc chất lượng thấp. Họ đã có toggle "Particles" trong Settings; ta cần nó **tự tắt** theo bậc chất lượng dò được, không chỉ tắt bằng tay.

### 4.8 Chọn và hover trông thế nào

`_applyMeshEffect(group, effect)` duyệt toàn bộ con của group và đổi `emissive`:

| Trạng thái | `emissive` | `emissiveIntensity` | Khác |
|---|---|---|---|
| mặc định | màu gốc đã lưu | 0.15 | scale gốc |
| **hover** | `0x58a6ff` (xanh sáng) | **0.3** | con trỏ đổi thành `pointer` |
| **chọn** | `0xffa657` (cam) | **0.5** | **scale × 1.08** |

Hai điểm thiết kế đúng: **hover và chọn khác nhau cả về màu lẫn về cường độ**, và **chọn còn phóng to 8%** — nên phân biệt được kể cả khi mất màu. `child.userData.baseEmissive` được lưu lúc tạo mesh nên khôi phục chính xác, không đoán.

> Cam `0xffa657` cho "đang chọn" **đụng dải đỏ/cam thương hiệu của ta**. Với theme đỏ, màu chọn phải đổi sang thứ tương phản với đỏ — trắng sáng hoặc xanh cyan là hai lựa chọn an toàn. Đây là chỗ ta **không** chép được giá trị, chỉ chép nguyên tắc (hai kênh: màu + kích thước).

### 4.9 Cái gì chuyển động — bảng tổng

| Thứ | Chuyển động | Chu kỳ |
|---|---|---|
| Pod | bồng bềnh trục Y, biên độ 0.08, lệch pha theo uid | `sin(t × 2)` |
| Đường nối | nét đứt chảy theo hướng | `FLOW_SPEED 2.0` |
| Hạt | bay dọc đường cong, fade hai đầu | 0.05 s/hạt |
| Camera | damping quán tính | `dampingFactor 0.08` |
| Hover/chọn | đổi emissive tức thì (**không tween**) | — |
| Panel DOM | trượt `translate` | 300 ms `ease-out` |
| Thanh CPU/MEM/XP | `transition-all` | 300–500 ms |

CSS còn có 8 `@keyframes` cho lớp DOM: `pulseRed` (vòng sóng đỏ toả ra, 1.5 s, dùng cho incident), `bounceIn` (0 → 1.15 → 1, 0.4 s), `fadeOut`, `slideUp`, `slideDown`, `shakeX` (rung ngang ±4px, 0.5 s), `modalIn` (scale 0.95 + dịch 10px), `logoGlow`.

> ⚠ **Không có `prefers-reduced-motion` ở bất kỳ đâu** — không trong CSS, không trong renderer. Với cổng a11y của ta thì đó là bắt buộc: tắt bồng bềnh, tắt hạt, tắt `pulseRed`/`shakeX`, giữ đổi màu tức thì. Ghi vào §12.4.

---

## 5. Màu và chữ

### 5.1 Bảng màu — giá trị thật

Khai ở `:root` của `style.css` và lặp lại trong `tailwind.config`:

```css
/* style.css — upstream Apache-2.0 */
:root {
  --k8s-blue:       #326CE5;   --k8s-blue-light: #58a6ff;
  --bg-dark:        #0d1117;   --bg-card:        #161b22;
  --bg-elevated:    #1c2333;
  --border-subtle:  rgba(255,255,255,0.10);
  --border-muted:   rgba(255,255,255,0.06);
  --text-primary:   rgba(255,255,255,0.92);
  --text-secondary: rgba(255,255,255,0.60);
  --text-muted:     rgba(255,255,255,0.35);
  --status-green:   #3fb950;   --status-yellow: #d29922;
  --status-red:     #f85149;   --status-blue:   #58a6ff;
  --status-purple:  #a855f7;
}
```

Nhận diện ngay: `#0d1117`, `#161b22`, `#3fb950`, `#f85149`, `#d29922`, `#58a6ff`, `#8b949e`, `#6e7681`, `#c9d1d9`, `#30363d` — **đây là bảng màu GitHub Dark**, gần như nguyên vẹn. Chỉ `#326CE5` (xanh Kubernetes chính thức) là ngoại lệ. Không phải họ tự chọn bảng màu; họ mượn một bảng đã được kiểm chứng.

> Đó là bài học thực dụng: **mượn một bảng màu tối đã qua kiểm định contrast thay vì tự trộn.** Với ta thì bảng đã chốt ở §10.4 rồi, nên chỉ ghi nhận cách làm.

**Chữ mã hoá bằng độ mờ, không bằng màu:** ba nấc `0.92 / 0.60 / 0.35` trên nền tối. Trong Tailwind điều này xuất hiện thành `text-white/90`, `/60`, `/40`, `/30`, `/20`. **Đây là quyết định đáng lấy nguyên xi** — một màu chữ, ba nấc alpha, không bao giờ lệch tông.

> ⚠ Nhưng `--text-muted` = `rgba(255,255,255,0.35)` trên `#0d1117` cho tỉ lệ tương phản **khoảng 3.5:1** — **trượt WCAG AA cho chữ thường (4.5:1)**. Và nó được dùng cho `.palette-label` (8px!) và `.palette-section-label`. Với cổng axe của ta, nấc thứ ba phải nâng lên ít nhất `0.55`, và cỡ chữ 8px thì phải bỏ hẳn.

**Màu bề mặt panel:** `rgba(255,255,255,0.05)` (kính) hoặc `rgba(0,0,0,0.6)` (prose) — xem §2.10. **Viền:** luôn `rgba(255,255,255,0.1)`.

### 5.2 Trạng thái mã hoá bằng màu — hai bảng, và chúng KHÔNG khớp nhau

Bảng DOM (`:root`) và bảng 3D (`ResourceMeshes.STATUS_COLORS`) là hai bảng riêng:

| Trạng thái | Màu 3D | So với `:root` |
|---|---|---|
| `Running` | `0x28a745` | **khác** `--status-green` (`#3fb950`) |
| `Succeeded` / `Completed` | `0x3fb950` | = `--status-green` |
| `Pending` / `Suspended` | `0xffa657` | **khác** `--status-yellow` (`#d29922`) |
| `Failed` | `0xd73a49` | **khác** `--status-red` (`#f85149`) |
| `CrashLoop` | `0xf85149` | = `--status-red` |
| `Terminating` | `0x8b949e` (xám) | — |
| `Unknown` | `0x6e7681` (xám đậm) | — |
| `Progressing` | `0x58a6ff` | = `--status-blue` |
| `Active` | `0x326CE5` | = xanh K8s |

Chín trạng thái, và **cùng một pod đang Running hiện màu `#28a745` trong 3D nhưng `#3fb950` ở chấm HUD**. Lệch nhỏ, mắt thường khó bắt, nhưng nó là **hai SSOT cho một sự thật** — đúng cái `code-conventions.md` § "No Derived Fields" cấm. §4.5 của hợp đồng ta đã nói "màu trong Three.js đọc từ token, không hardcode"; đây là bằng chứng cụ thể vì sao điều đó cần thiết.

**Phân biệt `Failed` với `CrashLoop` bằng hai sắc đỏ (`#d73a49` vs `#f85149`) là không dùng được** — hai màu đó cách nhau quá gần, và với người mù màu thì cả hai với `Running` cũng gần nhau. Ta cần kênh thứ hai: hình dạng, nhãn, hoặc chuyển động.

### 5.3 Thang chữ

Hai font, nạp từ Google Fonts:

- **Inter** (400/500/600/700/800) cho giao diện
- **JetBrains Mono** (400/500) cho mọi thứ dạng số/lệnh/tên tài nguyên

Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` và `'SF Mono', monospace`.

Thang cỡ đo được, từ nhỏ tới lớn:

| Cỡ | Dùng cho |
|---|---|
| **0.5rem (8px)** | `.palette-label`, `.palette-section-label` |
| 10px (`text-[10px]`) | tiêu đề minimap, badge chuông, phím tắt trong context menu |
| 11px (`text-[11px]`) | mô tả thẻ level, số sao GitHub |
| 0.65rem | `.keyboard-hint` |
| 0.7rem | ghi chú menu, gợi ý bàn phím |
| 0.75rem (`text-xs`) | **cỡ chủ đạo của toàn bộ chrome** — nhãn HUD, nút thanh công cụ, tab |
| 0.875rem (`text-sm`) | tiêu đề panel, tên tài nguyên, input terminal |
| 0.95rem | phụ đề menu |
| 1.125rem (`text-lg`) | tiêu đề modal |
| 4rem | logo menu chính |

> **Thang này quá dày ở đầu nhỏ và quá thưa ở đầu lớn.** Sáu nấc dưới 12px (8, 10, 11, 10.4, 11.2, 12) là quá nhiều — mắt không phân biệt được 10px với 11px, nên chúng không mã hoá thêm thông tin gì, chỉ tạo cơ hội lệch. Đồng thời nhảy thẳng từ 18px lên 64px.
>
> **Với chữ tiếng Việt thì 8px là không đọc được, chấm hết** — dấu thanh và dấu mũ chồng nhau ở cỡ đó (`ế`, `ộ`, `ữ` cần chiều cao gấp rưỡi chữ Latin trần). Sàn của ta phải là **11px**, và nhãn rail nên là 12px. Đây là ràng buộc ngôn ngữ, không phải sở thích, và nó có hệ quả trực tiếp: **rail của ta phải rộng hơn 68px** để chứa nhãn tiếng Việt ở 12px. Ước tính 76–84px. Ghi vào §12.5.

`.keyboard-hint` là một pattern nhỏ đáng lấy: `min-width: 20px; height: 20px; border-radius: 4px; background: rgba(255,255,255,0.08); border: 1px solid var(--border-subtle); font-family: monospace` — một "phím" nhất quán dùng ở menu, tooltip, thanh công cụ, tutorial. Một class, dùng khắp nơi.

### 5.4 Bộ icon

**Không dùng thư viện icon nào.** Mọi icon là `<svg>` viết tay inline, `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="2"`, `fill="none"` — tức là **phong cách Heroicons/Feather**, và một số đúng là Heroicons chép tay (bánh răng, chuông, dấu hỏi). Kích thước hiển thị `w-4 h-4` (16px) trong chrome, `w-3.5 h-3.5` (14px) trong nút gợi ý.

Icon **tài nguyên** thì khác: có `fill` màu riêng theo kind với `fill-opacity` 0.15–0.25, và hình dạng mang nghĩa:

| Kind | Hình | Màu |
|---|---|---|
| Pod | lục giác | `#326CE5` |
| Deployment | chữ nhật bo góc | `#f97316` |
| ReplicaSet | **ba** chữ nhật xếp chồng, opacity tăng dần 0.15/0.20/0.25 | `#eab308` |
| StatefulSet | lục giác có chữ `0` ở giữa | `#a855f7` |
| DaemonSet | ngôi sao | `#06b6d4` |
| Job | hình thoi có gạch chân | `#d97706` |
| CronJob | đồng hồ | `#d97706` |

> Ba chữ nhật xếp chồng cho ReplicaSet, và lục giác **có số 0** cho StatefulSet (ordinal index) — đó là icon *dạy* chứ không chỉ *nhận diện*. Đáng lấy nguyên ý tưởng. Job và CronJob dùng **cùng một màu** `#d97706`, phân biệt chỉ bằng hình — đúng cách.

**Nhược điểm:** icon inline trong `index.html` làm file phình lên 100KB, và không tái dùng được. Ta dùng `<svg><use href="#sprite">` hoặc component React.

---

## 6. Cái gì đáng lấy, cái gì yếu

### 6.1 Bảy thứ đáng lấy, xếp theo giá trị trên chi phí

| # | Thứ | Chi phí | Vì sao |
|---|---|---|---|
| 1 | **Lớp overlay `pointer-events: none` + con `auto`** (§1.2) | 8 dòng CSS | Toàn bộ bố cục toàn màn hình đứng trên đúng cơ chế này. Không có nó thì phải hit-test thủ công. |
| 2 | **Ngưỡng 4px phân biệt bấm/kéo** (§3.2) | ~15 dòng JS | Một cử chỉ chuột phục vụ ba việc, không cần thanh chọn chế độ. |
| 3 | **Quy tắc nền panel: prose → đen đục, số → kính nhạt** (§2.10) | 0 | Giải quyết bài toán tương phản trên nền động một cách có nguyên tắc. |
| 4 | **Bốn màu theo loại quan hệ** cho đường nối (§4.6) | thấp | Trả lời được "vì sao Pod này có bốn đường tới nó". |
| 5 | **Ba nấc alpha chữ 0.92/0.60/0.35** (§5.1) | 0 | Một màu chữ, ba mức, không lệch tông. (Nấc ba phải nâng lên 0.55 cho AA.) |
| 6 | **Bốn tab inspector = bốn lệnh kubectl** (§2.6) | thấp | Cùng dữ liệu, bốn cách trình bày, mỗi cách dạy một lệnh. |
| 7 | **Gợi ý tên rút từ objective** (§3.1) | thấp | Biến ma sát thành gợi ý sư phạm. |

Cộng thêm hai thứ nhỏ nhưng đáng: **ẩn theo thứ tự ưu tiên ở màn hẹp** (§2.1 — nguyên tắc đúng, cách thực hiện sai) và **rim light màu thương hiệu** (§4.2 — một dòng, đổi tông cả cảnh).

### 6.2 Chín chỗ yếu — và ta thừa hưởng chúng nếu chép mù

**Yếu về a11y** (ta có cổng, họ không):

1. `.palette-item` là `<div>` → không focus, không Enter/Space, không accessible name.
2. Tooltip chỉ `:hover` → người dùng bàn phím không bao giờ biết "RS" là gì.
3. **Không có đường bàn phím nào để chọn vật trong scene** — lỗ hổng cấu trúc (§7.3).
4. Phím `1`–`9` **không tạo được gì** — biến `selectedResource` được ghi, không được đọc.
5. `display:none` ở màn hẹp xoá luôn khỏi cây a11y.
6. Không `prefers-reduced-motion`, không `aria-live`, đúng một `aria-label` trong cả game.
7. `--text-muted` ở 3.5:1 và chữ 8px — trượt AA hai lần.

**Yếu về bố cục:**

8. **Bảy hằng số ma `48px`**, không biến chiều cao HUD (§1.4b).
9. **Incident drawer phủ lên rail** ở màn rộng — bug thật, cùng `z-30` và thắng nhờ thứ tự DOM (§2.7).
10. **Rail 18 mục tràn** trên màn ≤1080p, `scrollbar-width: none` nên không có dấu hiệu (§2.2).
11. **Game chính không có bậc phóng to** — ba media query lớn chỉ áp cho `/draw` (§1.6).

**Yếu về mô hình:**

12. **Pod không đứng trên node** — quan hệ chỉ thể hiện bằng đường nối (§4.5). Mất mát sư phạm lớn nhất.
13. **Node không biểu diễn sức chứa** (§4.4).
14. **Hai bảng màu trạng thái không khớp** (§5.2).
15. **`/` và `M` bị bắt ở hai listener** — hành vi phụ thuộc thứ tự đăng ký (§3.4).
16. Nhãn "kubectl" trên thanh công cụ **trông như nút nhưng không bấm được** (§2.4).

### 6.3 Bốn chỗ ta nên khác họ một cách có chủ ý

Ngoài phần a11y (bắt buộc), có bốn chỗ tôi cho rằng cách của ta nên khác — không phải vì thương hiệu, mà vì ta làm **nền tảng học**, họ làm **game**:

1. **Pod bị ràng buộc vị trí vào node.** (§4.5) Không gian phải mang nghĩa. Node chết → pod rơi/tái phân bố là bài giảng `NodeNotReady` hay nhất có thể có.
2. **Rail lọc theo `availableResources` của level.** (§2.2) Họ có sẵn dữ liệu và không dùng. Level 1 chỉ Pod và Namespace thì rail chỉ nên có hai ô — vừa giải quyết tràn, vừa giảm tải nhận thức cho người mới.
3. **Một panel "Danh sách tài nguyên" focus được, làm đường chọn chính thức.** (§7.3) Không phải chỉ để qua cổng a11y — nó là tính năng mà người dùng chuột cũng cần khi có 40 pod.
4. **Rail rộng hơn 68px** (~76–84px) vì nhãn tiếng Việt ở sàn 11–12px. (§5.3) Ràng buộc ngôn ngữ, không phải sở thích.

### 6.4 Một câu đánh giá thẳng

Cái làm giao diện của họ trông tốt **không phải bảng màu, không phải icon, không phải shader** — mà là **một quyết định kiến trúc duy nhất: canvas chiếm toàn bộ viewport và không có gì chia phần diện tích với nó.** Mọi thứ còn lại (kính mờ, bo góc, ba nấc alpha) là hệ quả và là trang trí đã được làm cẩn thận.

Nghĩa là: **ta có thể lấy toàn bộ giá trị của bố cục đó với bảng màu đỏ, chữ tiếng Việt, và cổng a11y đầy đủ — vì ba thứ đó không đụng gì tới quyết định kiến trúc.** Bản dựng đầu bị bác không phải vì nó thiếu đẹp, mà vì nó chia ô. Sửa đúng một điều đó là đủ.

---


## 7. Câu hỏi a11y, cụ thể

### 7.1 Điểm xuất phát: canvas của họ KHÔNG phải toàn bộ giao diện

Giả định trong đề bài ("canvas của họ presumably là toàn bộ giao diện") **sai theo hướng có lợi cho ta**. Đo thật: trong 9 vùng chrome, **8 vùng là DOM thật**, chỉ **1 vùng là canvas** (minimap).

| Vùng | DOM thật? | Focus được như hiện tại? | Ta cần làm gì |
|---|---|---|---|
| HUD thanh trên | ✅ | một phần — `<button>` thật cho Menu/pause/tốc độ/chuông/settings; số đếm là `<span>` trơ | thêm `role="status"` + `aria-live` cho cụm đếm |
| Rail tài nguyên | ✅ markup tĩnh | ❌ — `.palette-item` là **`<div>`**, không `tabindex`, không `role` | đổi sang `<button>`; một sửa được cả focus lẫn Enter/Space |
| Thẻ level | ✅ | một phần — nút gập và nút gợi ý là `<button>`; checklist là `<div>` | checklist thành `<ul>`; tiến độ vào `aria-live="polite"` |
| Thanh công cụ | ✅ | ✅ — bốn `<button>` thật | thêm `aria-label`; **biến nhãn "kubectl" thành `<button>` thật** (§2.4) |
| Inspector drawer | ✅ | một phần — tab là `<button>` nhưng không có ARIA tabs | dựng đúng tabs pattern; quản lý focus khi mở/đóng |
| Incident drawer | ✅ | một phần | như trên |
| Terminal kubectl | ✅ `<input>` thật | ✅ **hoàn toàn dùng được bằng bàn phím** | giữ nguyên mô hình; thêm `aria-live` cho output |
| Metrics dashboard | ✅ | một phần | như inspector |
| **Minimap** | ❌ **canvas 2D** | ❌ | §7.3 |
| **Scene 3D** | ❌ canvas WebGL | ❌ | §7.3 |

Kết luận sớm, và nó đáng mừng: **bố cục toàn màn hình không hề mâu thuẫn với cổng axe.** Overlay nổi trên canvas *vẫn là DOM*. §12.4 nói đúng, và giờ có số liệu đỡ lưng. Cái làm hỏng a11y của upstream không phải bố cục — mà là ba quyết định nhỏ, độc lập với bố cục: dùng `<div>` thay `<button>`, tooltip chỉ `:hover`, và không có đường bàn phím nào để chọn vật trong scene.

### 7.2 Ba lỗi của họ mà ta sửa gần như miễn phí

**(a) `.palette-item` là `<div draggable>`.** Không focus được, không kích hoạt bằng Enter/Space, không có accessible name (nhãn "RS" không phải tên). Đổi sang `<button type="button">`: focus được, `click` đã nhận Enter/Space, `aria-label="ReplicaSet"` đặt được. **Thuộc tính `draggable` vẫn dùng được trên `<button>`** nên không mất đường chuột. Một thay đổi, ba lỗi biến mất.

**(b) Tooltip chỉ `:hover`.** Thêm `:focus-visible` vào selector và dùng `aria-describedby`. Chi phí: một dòng CSS + một thuộc tính.

**(c) Ẩn bằng `display:none` ở màn hẹp.** Xoá khỏi cây a11y luôn. Thay bằng nút bung ra (§2.1, §2.3).

### 7.3 Hai chỗ tương tác chỉ-canvas — nơi ta BẮT BUỘC phải có bản DOM tương đương

**Chỗ 1 — chọn một đối tượng trong scene.** Của họ: raycast từ toạ độ chuột, không có đường thay thế. Với canvas `aria-hidden="true"` của ta thì đối tượng 3D **không tồn tại với bàn phím**. Đây là điểm chết duy nhất thật sự nghiêm trọng.

Ba đường ra, xếp theo mức khuyến nghị:

1. **Danh sách tài nguyên là DOM thật, và nó CHÍNH LÀ đường chọn.** Một overlay danh sách (có thể là incident drawer mở rộng, hoặc một panel "Tài nguyên" gập được ở trái) liệt kê mọi resource dưới dạng `<button>`. Kích hoạt một mục = chọn resource đó = inspector mở + camera `focusResource()` bay tới. Chuột và bàn phím dùng **cùng một** state, chỉ khác cách trỏ tới. Rẻ nhất, và cho luôn một tính năng mà người dùng chuột cũng thích: tìm nhanh một pod trong 40 pod.
2. **Roving tabindex trên các "proxy" DOM chồng lên vị trí chiếu của vật.** Dùng `renderer.getScreenPosition(uid)` (upstream đã có sẵn hàm này) để đặt một `<button>` trong suốt tại toạ độ đó. Đúng về không gian, nhưng phải cập nhật mỗi khi camera động → tốn, và thứ tự tab nhảy loạn theo góc nhìn. **Không khuyến nghị.**
3. **Chỉ dựa vào terminal kubectl.** `kubectl get pods` + `kubectl describe pod x` là đường bàn phím **đã hoạt động** trong upstream. Đủ để *chơi*, không đủ để *khám phá* — người dùng bàn phím phải biết trước tên mới gõ được. Dùng làm đường thứ hai, không làm đường duy nhất.

Chốt: **(1) là đường chính, (3) là đường bổ trợ.** Ghi vào §12.5 như một vùng chrome thứ tám ("Danh sách tài nguyên") — hiện §12.5 chưa có vùng nào đảm nhiệm việc này, vì inspector chỉ *hiển thị* thứ đã chọn chứ không *cho chọn*.

**Chỗ 2 — minimap.** Của họ: canvas 2D + kéo chuột để dời viewport, không có đường bàn phím. Nhưng chức năng của nó tầm thường để làm bằng DOM: nó chỉ điều khiển camera. Ba–bốn nút "toàn cảnh / theo node / theo namespace" là DOM thuần, phục vụ đúng nhu cầu đó cho cả chuột lẫn bàn phím. Minimap canvas vẫn giữ được — nhưng phải `aria-hidden="true"` và **không được là đường duy nhất** để dời góc nhìn.

> Nói thẳng một chỗ tôi tự bác mình: ban đầu tôi định đề xuất làm minimap bằng SVG cho focus được. Nhưng minimap là **bản đồ không gian**, và "focus vào một chấm trên bản đồ" không có nghĩa gì với người không nhìn thấy bản đồ. Đường đúng không phải làm bản đồ focus được, mà là **có cách khác đạt cùng mục tiêu** (dời góc nhìn) không cần bản đồ. Đó là nút, không phải SVG.

### 7.4 Bẫy riêng của bố cục overlay chồng lớp — §12.4 đã cảnh báo, giờ đo được

§12.4 viết: *"Overlay chồng nhau nhiều lớp là chỗ dễ hỏng nhất của bố cục này."* Upstream chứng minh bằng ba cách cụ thể:

1. **Thứ tự DOM ≠ thứ tự đọc.** Rail nằm *sau* thẻ level trong `index.html`, nên Tab đi qua thẻ level rồi mới tới rail — ngược thứ tự thị giác (rail ở trái thẻ level). Hệ quả trực tiếp của `position: fixed`: **thứ tự thị giác do CSS quyết, thứ tự tab do DOM quyết, và không có gì buộc hai cái khớp nhau.** Ta phải sắp thứ tự DOM theo thứ tự đọc mong muốn và **kiểm bằng bàn phím thật**, không suy luận.
2. **Hai cây DOM (§1.3) = hai đoạn tab tách rời.** Panel gắn `body` luôn đứng *sau* toàn bộ `#game-container` trong thứ tự tab, bất kể chúng nằm đâu trên màn. Một lớp overlay duy nhất giải quyết triệt để.
3. **Modal không bẫy focus** (§3.1). Với `fixed` + backdrop, chuột bị chặn còn bàn phím thì không — sai lệch giữa hai kênh input là dấu hiệu kinh điển của modal tự chế. Dùng `<dialog>` native.

Thêm một bẫy họ không gặp nhưng ta sẽ gặp: **`aria-hidden` trên canvas không đủ nếu canvas nhận focus.** Canvas của họ không có `tabindex` nên an toàn. Nếu lane E thêm `tabindex="0"` để bắt phím trên canvas thì `aria-hidden` + focusable = vi phạm axe (`aria-hidden-focus`), lỗi **chắc chắn đỏ**. Bắt phím ở `document`, không ở canvas.

### 7.5 `aria-live` — đặt ở đâu

Upstream có **đúng một** `aria-label` trong toàn bộ giao diện game (nút gập thẻ level) và **không có `aria-live` nào**. Mọi thay đổi trạng thái — pod chuyển Running, incident nổ ra, objective xong — hoàn toàn im lặng với screen reader.

Bốn chỗ ta cần, xếp theo mức ồn:

| Chỗ | Mức | Vì sao |
|---|---|---|
| Tiến độ objective (`#obj-list`) | `polite` | thay đổi thưa, và là thông tin người chơi đang chờ |
| Bộ đếm Pods R/P/F trên HUD | `polite`, có **throttle** | đổi mỗi tick; đọc thẳng sẽ ồn không chịu nổi. Chỉ thông báo khi *tổng* đổi |
| Incident mới | `assertive` | đây là thứ ngắt việc đang làm — đúng ngữ nghĩa `assertive` |
| Output terminal | `polite` trên `#cmd-output` | người dùng vừa gõ lệnh nên đang chờ kết quả |

Không đặt `aria-live` lên: CPU/MEM (đổi liên tục, vô nghĩa khi đọc), đồng hồ, thanh XP.

---

## Nguồn tham khảo

Toàn bộ URL đã kiểm trả `200` ngày 2026-09-08 (`curl -sIL -o /dev/null -w %{http_code}`).

| URL | Dùng cho |
|---|---|
| https://github.com/rohitg00/k8sgames | repo gốc |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/index.html | §1, §2.2–2.4, §3.1, §3.5, §5.4 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/style.css | §1, §2, §4.9, §5.1, §5.3 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/ui/HUD.js | §2.1 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/ui/Minimap.js | §2.5 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/ui/InspectorPanel.js | §2.6, §3.2 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/ui/IncidentPanel.js | §2.7 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/ui/MetricsDashboard.js | §2.8, §3.5 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/ui/CommandBar.js | §2.9, §3.4, §3.5 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/ui/ContextMenu.js | §3.2, §3.5 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/rendering/ClusterRenderer.js | §4.1–4.3, §4.8, §4.9 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/rendering/ResourceMeshes.js | §4.4, §4.5, §5.2 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/rendering/ConnectionLines.js | §4.6 |
| https://raw.githubusercontent.com/rohitg00/k8sgames/main/js/rendering/ParticleTraffic.js | §4.7 |
| https://k8sgames.com | bản chạy trực tiếp |

**Đã đọc, không trích:** `js/ui/SettingsPanel.js` (chỉ là modal toggle, không có gì về bố cục).

**Chưa đọc, và đó là giới hạn của báo cáo này:** `draw.html` (49KB — giao diện `/draw`, có bậc phóng to riêng mà game chính không có; nếu ta muốn tham khảo cách họ scale UI theo màn thì đó là chỗ để đọc); phần thân `js/ui/InspectorPanel.js` và `IncidentPanel.js` sau dòng ~80 (cách render nội dung từng tab — báo cáo này chỉ mô tả vỏ và tab bar); `og-image.html`. Không đọc `screenshot.png` (900KB) — mọi mô tả thị giác ở trên đo từ CSS/JS, không từ ảnh.

# P16 — Hợp đồng token (màu, chữ, khoảng cách, bo góc, nâng nền, chuyển động, motif)

**Ngày:** 2026-09-10 · **Loại:** Contract (SSOT) · **Tiêu thụ bởi:** L0..L8
**Thay thế:** giá trị trong `apps/web/src/app/globals.css`. Cấu trúc file đó giữ nguyên; chỉ VALUE đổi.

> Đây là hợp đồng, không phải gợi ý. Tám lane chạy song song trong context riêng và không đọc
> được mã của nhau. Tên token ở đây là tên duy nhất; giá trị ở đây là giá trị duy nhất. Lane nào
> cần một màu không có trong danh sách thì mở thay đổi hợp đồng, không tự đặt.
>
> Mọi con số tương phản dưới đây tính tay trong chính tài liệu này theo WCAG 2.1
> (sRGB → tuyến tính → độ chói tương đối), trừ các dòng ghi **(kế thừa)** — đó là token giữ
> nguyên byte-identical từ hệ hiện tại nên số của chúng là số cổng hiện tại đang sinh ra, không
> phải phép tính mới.

---

## 0. Phạm vi, và thứ CỐ Ý nằm ngoài

**Trong phạm vi:** đúng 24 token ngữ nghĩa, 5 token thương hiệu, 3 token thời lượng, cộng thang
chữ / khoảng cách / bo góc / nâng nền / motif ellipse.

**Ngoài phạm vi, và phải xử lý tường minh:** `--difficulty-*` (8), `--kind-*` (8), `--status-*`
(6) đang tồn tại trong `globals.css` và đang được thẻ danh mục dùng thật. Hợp đồng này **không**
pin lại chúng. Lane L2 vì vậy có hai đường và chỉ hai:

1. Giữ nguyên byte-identical giá trị hiện tại (số đo của chúng vẫn đúng vì `--background`,
   `--card`, `--muted` sáng không đổi độ chói — xem §1.3), hoặc
2. Mở một thay đổi hợp đồng bổ sung trước khi đổi bất kỳ giá trị nào.

Tự đặt giá trị mới cho ba nhóm đó là vi phạm hợp đồng. Ghi ra đây để không ai coi sự vắng mặt
là giấy phép.

**`--ease-out` cũng ngoài phạm vi và cũng KHÔNG được đổi:** `cubic-bezier(0.16, 1, 0.3, 1)`,
giữ nguyên. Nó trùng tên với biến theme sẵn có của Tailwind v4 một cách có chủ ý (khai sau
`@import 'tailwindcss'` nên thắng theo thứ tự nguồn) — đổi nó là đổi tiện ích `ease-out` của
toàn hệ.

---

## 1. Màu

### 1.1 Cách quy đổi, và cách tự kiểm

Mọi giá trị oklch dưới đây suy từ hex thương hiệu bằng đúng chuỗi này:

```
hex → sRGB[0,1] → tuyến tính hoá (c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4)
    → LMS (ma trận OKLab) → căn bậc ba → OKLab → OKLCH (C = √(a²+b²), H = atan2(b,a))
```

**Đối chứng của chính phép quy đổi này:** chạy nó ngược lại trên hai giá trị mà hệ hiện tại đã
ghim và đã gác, kết quả phải khớp tới chữ số thứ ba.

| Kiểm | Hệ hiện tại ghim | Tài liệu này tính ra |
|---|---|---|
| `#e31029` | `oklch(0.58 0.23 25)` | L=0.5807, C=0.2298, H=24.99 ✓ |
| `#e31029` trên trắng | 4.82 | 4.80 (lệch ở chữ số thứ ba, do làm tròn hàm mũ) |
| `#373D4E` trên trắng | 10.83 (§2.1 design) | 10.8250 ✓ |
| `#BC2626` trên trắng | 6.10 (§2.1 design) | 6.0985 ✓ |
| `#EFF003` trên trắng | 1.23 (§2.1 design) | 1.2255 ✓ |

Bốn dòng cuối khớp tuyệt đối với con số đã công bố trong design, nên phép quy đổi ở đây tin
được. Người review muốn kiểm lại thì chạy đúng chuỗi trên, không cần tin tài liệu.

### 1.2 Suy diễn từng màu thương hiệu — làm được lại từ đầu

**`#BC2626` → `oklch(0.519 0.186 26.7)`**

```
R 188/255 = 0.737255 → ((0.737255+0.055)/1.055)^2.4 = 0.750953^2.4 = 0.502887
G,B 38/255 = 0.149020 → (0.193384)^2.4                             = 0.019382
LMS  l = 0.218693   m = 0.121839   s = 0.062075
∛    l'= 0.602430   m'= 0.495750   s'= 0.395950
L = 0.2104543·l' + 0.7936178·m' − 0.0040720·s' = 0.51861
a = 1.9779985·l' − 2.4285922·m' + 0.4505937·s' = 0.16604
b = 0.0259040·l' + 0.7827718·m' − 0.8086758·s' = 0.08347
C = √(0.16604² + 0.08347²) = 0.18584      H = atan2(0.08347, 0.16604) = 26.68°
Y = 0.2126·0.502887 + 0.7152·0.019382 + 0.0722·0.019382 = 0.122175
tương phản với trắng = 1.05 / 0.172175 = 6.0985
```

**`#373D4E` → `oklch(0.362 0.031 269.7)`**

```
R 0.215686 → 0.038204   G 0.239216 → 0.046665   B 0.305882 → 0.076187
LMS  l = 0.044697   m = 0.048043   s = 0.064515
∛    l'= 0.354890   m'= 0.363530   s'= 0.401080
L = 0.36156   a = −0.00017   b = −0.03059
C = 0.03059   H = atan2(−0.03059, −0.00017) = 269.68°
Y = 0.046998 → tương phản với trắng = 1.05 / 0.096998 = 10.8250
```

`a` gần bằng 0 tuyệt đối và `b` âm: đây là một xám lạnh thuần, hue 269.7 sát ngay hue 263.7 của
navy thương hiệu. Đó là lý do nó thay được `--foreground` gần-đen mà vẫn thuộc về bảng màu này.

**`#DE221A` → `oklch(0.578 0.220 29.0)`** · Y = 0.167502 · trắng: 4.8275
**`#EFF003` → `oklch(0.924 0.201 110.1)`** · Y = 0.806775 · trắng: **1.2255** · đen: 17.1355
**`#B89C0E` → `oklch(0.697 0.141 95.9)`** · Y = 0.339991 · trắng: **2.6924** · đen: 7.7998
**`#051A53` → `oklch(0.247 0.107 263.7)`** · Y = 0.013957 · trắng: 16.4173

### 1.3 Nhánh tối: hue 263.7, chroma 0.016, và vì sao số cũ vẫn dùng được

Mặt nền tối lấy hue **263.7** — hue đo được của `#051A53`, chứ không phải 262.881 thừa kế từ
bảng lam đã chết. Chroma lên 0.016 (từ 0.012).

Đổi này **không** làm lệch một phép đo nào, và đó là điều kiểm được chứ không phải điều mong:

```
oklch(0.145 0.012 262.881) → Y = 0.0030353   (hệ hiện tại)
oklch(0.145 0.016 263.7)   → Y = 0.0030356   (hợp đồng này)
```

Ở oklch, thêm chroma trong khi giữ L gần như không đụng độ chói tương đối. Vì vậy mọi tỉ lệ tính
trên mặt nền tối giữ nguyên tới hai chữ số, và các token kế thừa (`--success`, `--warning`)
không cần đo lại.

### 1.4 Bảng token ngữ nghĩa

| Token | Sáng (`:root`) | Tối (`.dark`) | Dùng để làm gì |
|---|---|---|---|
| `--background` | `oklch(1 0 0)` | `oklch(0.145 0.016 263.7)` ≈ `#070A11` | Nền trang. |
| `--foreground` | `oklch(0.362 0.031 269.7)` ← `#373D4E` | `oklch(0.97 0.008 263.7)` | Chữ chính. |
| `--card` | `oklch(1 0 0)` | `oklch(0.205 0.016 263.7)` ≈ `#13171F` | Mặt thẻ nổi trên nền trang. |
| `--card-foreground` | `oklch(0.362 0.031 269.7)` | `oklch(0.97 0.008 263.7)` | Chữ trong thẻ. |
| `--popover` | `oklch(1 0 0)` | `oklch(0.205 0.016 263.7)` | Mặt popover/dropdown/select. |
| `--popover-foreground` | `oklch(0.362 0.031 269.7)` | `oklch(0.97 0.008 263.7)` | Chữ trong popover. |
| `--primary` | `oklch(0.519 0.186 26.7)` ← `#BC2626` | `oklch(0.680 0.190 26.7)` | Nút hành động chính (nền ĐẶC), link, vòng focus. |
| `--primary-foreground` | `oklch(0.985 0 0)` | `oklch(0.145 0.016 263.7)` | Chữ trên mặt primary. |
| `--secondary` | `oklch(0.97 0.005 263.7)` | `oklch(0.269 0.016 263.7)` ≈ `#22262E` | Nút phụ, nút Copy/Chạy trong code block. |
| `--secondary-foreground` | `oklch(0.362 0.031 269.7)` | `oklch(0.97 0.008 263.7)` | Chữ trên mặt secondary. |
| `--muted` | `oklch(0.97 0.005 263.7)` | `oklch(0.269 0.016 263.7)` | Nền mờ: skeleton, code block, hàng bảng hover. |
| `--muted-foreground` | `oklch(0.50 0.024 269.7)` | `oklch(0.72 0.018 263.7)` | Chữ phụ, ghi chú, metadata. |
| `--accent` | `oklch(0.951 0.023 26.7)` | `oklch(0.269 0.016 263.7)` | Hover/focus của item tương tác (menu, tab). Sáng: một chạm thương hiệu thật. |
| `--accent-foreground` | `oklch(0.362 0.031 269.7)` | `oklch(0.97 0.008 263.7)` | Chữ trên mặt accent. |
| `--destructive` | `oklch(0.505 0.192 29)` | `oklch(0.704 0.175 29)` | Hành động phá huỷ. Lúc nghỉ là màu CHỮ + VIỀN, không phải màu nền. |
| `--destructive-foreground` | `oklch(0.985 0 0)` | `oklch(0.145 0.016 263.7)` | Chữ trên mặt destructive ĐẶC (chỉ tồn tại ở trạng thái hover). |
| `--success` | `oklch(0.518 0.146 150.741)` (kế thừa) | `oklch(0.696 0.17 150.741)` (kế thừa) | Đạt: chấm lab, quiz đúng, nhiệm vụ xong. |
| `--success-foreground` | `oklch(0.985 0 0)` | `oklch(0.145 0.016 263.7)` | Chữ trên mặt success. |
| `--warning` | `oklch(0.541 0.15 55.98)` (kế thừa) | `oklch(0.769 0.188 70.08)` (kế thừa) | Cảnh báo: sắp hết TTL, gần chạm hardCap, sức chứa thấp. |
| `--warning-foreground` | `oklch(0.985 0 0)` | `oklch(0.145 0.016 263.7)` | Chữ trên mặt warning. |
| `--border` | `oklch(0.912 0.008 263.7)` | `oklch(1 0 0 / 12%)` | Ranh giới **trang trí**: viền thẻ, kẻ dòng bảng, `Separator`. |
| `--input` | `oklch(0.63 0.014 263.7)` | `oklch(1 0 0 / 38%)` | Ranh giới **nhận dạng control**: viền `Input`/`Textarea`/`Select`/`Checkbox`/`Button outline`, rãnh `Switch` lúc tắt. |
| `--ring` | `oklch(0.519 0.186 26.7)` | `oklch(0.680 0.190 26.7)` | Vòng focus. **BẰNG `--primary` theo thiết kế** — xem §1.7. |
| `--radius` | `0.75rem` | *(không lặp — xem §5)* | Bo góc gốc, mọi bậc suy từ đây. |

**`--input` ≠ `--border`, và đó là quyết định, không phải sót.** shadcn để hai cái bằng nhau;
giá trị đó cho 1.30:1 trên trắng, tức một ô nhập gần như vô hình cho tới khi focus. SC 1.4.11
đòi 3:1 cho ranh giới nhận dạng control, và `axe-core` **không có rule nào đo contrast của
viền** — nên hoặc đo tay ở §1.6, hoặc không ở đâu cả.

**`--foreground` tối là `0.97`, không phải trắng tinh.** Trắng 100% trên nền gần đen gây loang
sáng (halation) ở người cận và người loạn thị; 0.97 cho 18.15:1, thừa xa 4.5, nên không mua
được gì bằng cách đẩy lên 1.0.

### 1.5 Token thương hiệu — chỉ tái hiện nhận diện, KHÔNG phải màu giao diện

Khai **một lần** ở `:root`. **Cấm lặp ở `.dark`**, và cổng phải khẳng định sự vắng mặt đó: một
màu logo đổi theo theme thì không còn là màu logo.

| Token | Hex | oklch | Dùng ở đâu |
|---|---|---|---|
| `--brand-emblem` | `#DE221A` | `oklch(0.578 0.220 29.0)` | **Chỉ** tái hiện logo: nét quét, chữ PTIT, cuốn sách. Không bao giờ là `bg-*`/`text-*` của UI. |
| `--brand-star` | `#EFF003` | `oklch(0.924 0.201 110.1)` | Dấu hiệu **thành tựu**, chỉ trên nền tối: lộ trình hoàn thành, quiz đúng tuyệt đối, lab đạt hết nhiệm vụ. |
| `--brand-star-shadow` | `#B89C0E` | `oklch(0.697 0.141 95.9)` | Mặt tối của ngôi sao. Chỉ đi kèm `--brand-star`, không đứng một mình. |
| `--brand-ink` | `#373D4E` | `oklch(0.362 0.031 269.7)` | Mực wordmark. Trùng giá trị với `--foreground` sáng — cố ý, và đó là lý do `--foreground` đọc như một phần của nhận diện. |
| `--brand-navy` | `#051A53` | `oklch(0.247 0.107 263.7)` | Navy tiêu đề của web PTIT. Nguồn của hue 263.7 ở mọi mặt nền lạnh. |

**`--brand-star` bị CẤM trên nền sáng.** `#EFF003` trên trắng đo được **1.23:1**. Ngưỡng thấp
nhất mà WCAG 2.1 đặt ra cho bất cứ thứ gì mang thông tin là 3.0 (SC 1.4.11); 1.23 không đạt kể
cả khi coi nó là đồ hoạ thuần. Trên nền tối `--background` nó được 16.15:1 — đó là chỗ duy nhất
nó được xuất hiện.

`--brand-star-shadow` cũng **2.69:1** trên trắng, cũng dưới 3.0, nên cùng lệnh cấm. Hai token
này không có ngoại lệ "chỉ là trang trí": chúng mang nghĩa thành tựu, tức mang thông tin.

`--brand-emblem` đạt 4.83:1 trên trắng — tức nó *đủ* tương phản, và đó chính là cái bẫy. Nó bị
cấm dùng làm màu giao diện không phải vì contrast mà vì **vai trò**: hai đỏ trong cùng một màn
hình là hai đỏ, người dùng đọc ra "có hai nghĩa" ở chỗ chỉ có một.

### 1.6 Bảng tương phản

Ngưỡng: **4.5** cho chữ (SC 1.4.3, cỡ thường), **3.0** cho thành phần phi-văn-bản và ranh giới
control (SC 1.4.11).

**Trộn alpha chạy trong sRGB ĐÃ MÃ HOÁ GAMMA, không phải linear-light.** CSS Color 4 §12: phép
composite chạy **sau** khi màu đã chuyển sang không gian đích, mà không gian đích của
`background-color`/`border-color` là sRGB mã hoá gamma. Đây không phải chuyện học thuật:
`docs/design-system.md` §1a ghi lại chính xác lần hệ này trộn trong linear-light và cổng contrast
báo `oklch(1 0 0 / 16%)` trên nền tối đạt **4.01:1**, trong khi trình duyệt render nó ra
`#313131` tức **1.53:1**. Công thức sai đã **chứng nhận cho đúng thứ cần chặn**, và hai con số
sai đó đã được chép sang ba nơi trước khi ai đó phát hiện. Hợp đồng này không lặp lại: mọi ô có
alpha dưới đây tính bằng số học 8-bit trên hex, và §7 bắt cổng chạy song song cả hai công thức
để việc đổi lại là ĐỎ chứ không phải "đẹp lên".

Ví dụ đúng, để đối chiếu: `--input` tối = trắng 38% trên `--background` (`#070A11`)
→ `R = 255×0.38 + 7×0.62 = 101`, `G = 103`, `B = 107` → `#65676B` → Y = 0.13527 → **3.49:1**.

#### Nhánh sáng

| Cặp | Ngưỡng | Đo được |
|---|---|---|
| `--foreground` / `--background` | 4.5 | **10.83** |
| `--foreground` / `--card` | 4.5 | 10.83 |
| `--foreground` / `--muted` | 4.5 | 9.92 |
| `--card-foreground` / `--card` | 4.5 | 10.83 |
| `--popover-foreground` / `--popover` | 4.5 | 10.83 |
| `--secondary-foreground` / `--secondary` | 4.5 | 9.92 |
| `--accent-foreground` / `--accent` | 4.5 | 9.31 |
| `--muted-foreground` / `--background` | 4.5 | 6.01 |
| `--muted-foreground` / `--card` | 4.5 | 6.01 |
| `--muted-foreground` / `--muted` | 4.5 | 5.51 |
| `--primary-foreground` / `--primary` | 4.5 | **5.84** |
| `--destructive-foreground` / `--destructive` | 4.5 | 6.21 |
| `--success-foreground` / `--success` | 4.5 | 4.95 (kế thừa) |
| `--warning-foreground` / `--warning` | 4.5 | 5.06 (kế thừa) |
| `--destructive` / `--background` | 4.5 (chữ, §2) **và** 3.0 (viền) | 6.48 |
| `--destructive` / `--card` | 4.5 **và** 3.0 | 6.48 |
| `--destructive` / `--muted` | 4.5 | **5.94** |
| `--primary` / `--background` | 3.0 (đồ hoạ) **và** 4.5 (khi là link) | **6.10** |
| `--primary` / `--card` | 3.0 và 4.5 | 6.10 |
| `--primary` / `--muted` | 4.5 | 5.59 |
| `--input` / `--background` | 3.0 | **3.50** |
| `--input` / `--card` | 3.0 | 3.50 |
| `--input` / `--muted` | 3.0 | **3.21** |
| `--ring` / `--background` | 3.0 | 6.10 |
| `--ring` / `--card` | 3.0 | 6.10 |
| `--border` / `--background` | — (trang trí, miễn trừ tường minh của SC 1.4.11) | 1.30 |
| `--ring` / `--primary` | miễn trừ có điều kiện (§1.7) | **1.00** |
| `--primary` / `--destructive` | — (số này LÀ lý do của §2) | **1.06** |
| `--brand-star` / `--background` | **CẤM** | **1.23** |
| `--brand-star-shadow` / `--background` | **CẤM** | **2.69** |
| `--brand-emblem` / `--background` | chỉ logo, không phải màu UI | 4.83 |

#### Nhánh tối

| Cặp | Ngưỡng | Đo được |
|---|---|---|
| `--foreground` / `--background` | 4.5 | **18.15** |
| `--foreground` / `--card` | 4.5 | 16.42 |
| `--foreground` / `--muted` | 4.5 | 13.86 |
| `--secondary-foreground` / `--secondary` | 4.5 | 13.86 |
| `--accent-foreground` / `--accent` | 4.5 | 13.86 |
| `--muted-foreground` / `--background` | 4.5 | 7.98 |
| `--muted-foreground` / `--card` | 4.5 | 7.22 |
| `--muted-foreground` / `--muted` | 4.5 | 6.09 |
| `--primary-foreground` / `--primary` | 4.5 | **6.31** |
| `--destructive-foreground` / `--destructive` | 4.5 | 6.98 |
| `--success-foreground` / `--success` | 4.5 | 7.82 (kế thừa) |
| `--warning-foreground` / `--warning` | 4.5 | 9.23 (kế thừa) |
| `--destructive` / `--background` | 4.5 và 3.0 | 6.98 |
| `--destructive` / `--card` | 4.5 và 3.0 | 6.31 |
| `--destructive` / `--muted` | 4.5 | **5.33** |
| `--primary` / `--background` | 4.5 | 6.31 |
| `--primary` / `--card` | 4.5 | **5.71** |
| `--primary` / `--muted` | 4.5 | **4.82** |
| `--input` / `--background` | 3.0 | **3.49** |
| `--input` / `--card` | 3.0 | 3.56 |
| `--input` / `--muted` | 3.0 | **3.42** |
| `--ring` / `--background` | 3.0 | 6.31 |
| `--ring` / `--card` | 3.0 | 5.71 |
| `--border` / `--background` | — (trang trí) | 1.33 |
| `--ring` / `--primary` | miễn trừ có điều kiện (§1.7) | **1.00** |
| `--primary` / `--destructive` | — | **1.11** |
| `--brand-star` / `--background` | cho phép (đây là nền duy nhất của nó) | **16.15** |

**Khoảng trống của hệ cũ đã ĐÓNG, và phải xoá pin cũ chứ không ghim lại số mới.**
`docs/design-system.md` §1c ghim một *absence pin*: `--destructive` sáng chỉ đạt **4.37:1** trên
`--muted`, dưới 4.5, nên cấm đặt nút/badge destructive vào khối `bg-muted`. Giá trị mới
`oklch(0.505 0.192 29)` cho **5.94:1**, tức khoảng trống đã đóng. Theo
`rules/pinned-baseline-test-companion.md`: khi một pin đỏ vì gap đã đóng thì **đảo nó**, không
"cập nhật con số". Việc phải làm là **xoá** absence pin đó và thêm cặp
`--destructive` / `--muted` vào `TEXT_PAIRS` ở cả hai theme. Đặt lại một pin mới ở đây là biến
một lần sửa thành một baseline vĩnh viễn.

<!-- updated 260913 -->

Số đo cập nhật 2026-09-13 cho primary tối: background 6.3056459:1, card 5.7070919:1, muted 4.8157422:1. Trắng tinh trên primary tối 3.1396889:1, đủ làm đối chứng focus 3:1 nhưng không đủ làm chữ thường 4.5:1. Bộ kiểm thử token giữ ngưỡng và số đo chuẩn.

### 1.7 Vòng focus: `--ring` = `--primary`, nên nó KHÔNG được vẽ sát mặt nút

Ràng buộc này giữ nguyên từ hệ hiện tại, và hệ quả của nó cũng giữ nguyên: mọi vòng focus nằm
sát một mặt `bg-primary` đều là **1.00:1**, tức vô hình, ở cả hai theme. Miễn trừ hai cặp
`--ring`/`--primary` khỏi bảng đo **chỉ đứng vững chừng nào offset thật sự có mặt**:

| Cơ chế | Dùng ở | Màu KỀ vòng focus |
|---|---|---|
| `ring-offset-2` + `ring-offset-background` | `Button`, `Switch`, `Checkbox` | `--background`/`--card` — 6.0885 sáng / 6.3056 tối trên background; 5.7071 tối trên card |
| `ring-current` | `StepNav`, nút đóng `Toast` | `text-*-foreground` của chính bề mặt, đã gác ≥4.5 |

Hai class của cơ chế thứ nhất **bắt buộc đi cùng nhau**. Thiếu `ring-offset-background` thì
Tailwind rơi về mặc định của chính nó (`--tw-ring-offset-color: #fff`), tức một khe **trắng**
trên nền tối. Cơ chế thứ hai dành cho hai chỗ mà offset là SAI chứ không phải thiếu: hàng bước
nằm trong `overflow-x-auto` nên vòng đẩy ra ngoài bị **cắt** ở mép cuộn, còn nút đóng toast thì
màu nền trang không hề kề nó.

---

## 2. Luật hai kênh: primary đụng destructive

Đây là luật, không phải hướng dẫn phong cách. Nó ràng buộc `packages/ui` và mọi lane gọi tới.

### 2.1 Lý do, bằng số

`--primary` và `--destructive` đều thuộc họ đỏ. Đo giữa hai mặt tô:

| | Sáng | Tối |
|---|---|---|
| `--primary` vs `--destructive` | **1.06:1** | **1.1062:1** |

Ngưỡng thấp nhất để mắt tách được hai thành phần phi-văn-bản cạnh nhau là 3.0. 1.06 không gần
ngưỡng đó, nó gần **1.00** — tức là "cùng một màu". Nếu cả hai cùng tô nền đặc thì nút "Lưu" và
nút "Xoá vĩnh viễn" trông y hệt nhau cho tới khi đọc chữ, và với người mù màu đỏ-lục hoặc trên
bản in đen trắng chúng **đúng là** một.

**Đổi sắc độ không cứu được.** Design §2.2 đã thử hướng "để destructive tối hơn": `#8C1D18` cho
chữ trắng 9,11:1 rất đẹp, nhưng tương phản giữa nó và đỏ primary **dưới 2:1**. Bất kỳ đỏ nào đủ
đỏ để đọc ra "nguy hiểm" đều nằm trong khoảng cách 3:1 của đỏ thương hiệu. Hết đường ở tầng màu.

### 2.2 Luật

| | `primary` | `destructive` |
|---|---|---|
| nền lúc nghỉ | `bg-primary` — **ĐẶC** | `bg-transparent` — **RỖNG** |
| viền | không có | `border border-destructive` |
| chữ | `text-primary-foreground` | `text-destructive` |
| icon | **không có icon mặc định** | **`TriangleAlert` bắt buộc**, `aria-hidden="true"` |
| hover | `bg-primary/90` | đảo sang nền ĐẶC `bg-destructive` + `text-destructive-foreground` |
| hộp xác nhận | không | `ConfirmDialog` cho **mọi** hành động phá huỷ |

Icon là **bắt buộc**, không phải trang trí. 1.06 là lý do.

### 2.3 Vì sao luật này sống sót khi khử màu

Quy hai nút về độ chói tương đối (chính là kênh xám mà ảnh đen trắng giữ lại):

| | mặt nút `primary` | mặt nút `destructive` lúc nghỉ | chênh |
|---|---|---|---|
| Sáng | `--primary` sáng | trong suốt, lộ `--background` | **6.0885:1** |
| Tối | `--primary` tối (`oklch(0.68 0.19 26.7)`) | trong suốt, lộ `--background` | **6.3056:1** |

Khác biệt ở **màu** là 1.0646 sáng / 1.1062 tối. Khác biệt ở **cấu trúc** trên background là 6.0885 sáng / 6.3056 tối. Xoá sạch sắc độ thì vẫn
còn một "khối đặc tối" đứng cạnh một "khung rỗng sáng". Đó là toàn bộ lý do luật nằm ở hình dạng.

### 2.4 Vì sao lúc nghỉ là trong suốt chứ không phải `bg-destructive/10`

Chữ đỏ trên nền hồng nhạt **không đạt** SC 1.4.3 ở nhánh sáng: hệ cũ đo được 3.99:1. Alpha
không cứu nổi vì mọi lớp phủ đều ăn vào đúng phần dư mỏng của chữ đỏ trên trắng. Bỏ hẳn tint giữ
nguyên **6.48:1** (sáng) và **6.98:1** (tối).

`Alert` **không** áp luật này. Nó vốn đã là dạng nhạt + viền, và không có biến thể alert nào tô
nền `--primary` đặc để mà lẫn. Nhãn ở đó là `text-foreground`, không phải `text-destructive`.

---

## 3. Chữ

### 3.1 Font — đã nối, KHÔNG đổi

**Be Vietnam Pro**, subset `vietnamese`, self-host qua `next/font/google` trong
`apps/web/src/app/layout.tsx`. Nó đúng sẵn: có subset tiếng Việt, `next/font` tự host nên
`font-src 'self'` không chặn. **Không lane nào được sửa lời gọi đó.**

```css
--font-sans: var(--font-be-vietnam-pro), ui-sans-serif, system-ui, -apple-system,
             'Segoe UI', Roboto, sans-serif;
--font-mono: ui-monospace, 'Cascadia Code', 'Cascadia Mono', 'Segoe UI Mono',
             Consolas, 'Liberation Mono', monospace;
```

Fallback stack là stack thật, không chỉ mỗi biến font: nếu biến chưa kịp gắn (lỗi mạng lúc
build, `next/font` fail) trang vẫn đọc được thay vì rơi về serif mặc định của trình duyệt.

**Code inline (`kubectl get pods`) dùng `--font-mono`, tức stack hệ. Không tải thêm font nào** —
`--font-mono` phải chứa **0 lần** `url(` và **0 lần** `@font-face`. Terminal là chuyện khác và
nằm ngoài `--font-mono`: nó giữ `dlp-terminal-nf.woff2` đang có, vì file đó dựng riêng cho glyph
Nerd Font hai ô của xterm.

**Cân chữ (weight):** chỉ dùng những weight mà lời gọi `next/font/google` hiện tại đã khai. Lane
nào cần một weight khác thì đó là thay đổi lời gọi đó, và phải đi kèm số đo kích thước subset —
không được để trình duyệt tự bôi đậm (synthetic bold), vì chữ tiếng Việt có dấu bị synthetic
bold làm dính dấu vào thân chữ.

### 3.2 Thang cỡ — `clamp()`, không điểm ngắt

Neo ở hai đầu **360px** và **1440px**. Dưới 360 giữ min, trên 1440 giữ max. Trang chủ vì vậy
không cần một `@media` nào cho cỡ chữ.

| Token | Giá trị | @360px | @1440px | Dùng ở |
|---|---|---|---|---|
| `--text-2xs` | `0.6875rem` | 11px | 11px | badge dày đặc, nhãn metadata. Chỉ dùng với `--leading-normal` trở lên. |
| `--text-xs` | `0.75rem` | 12px | 12px | chú thích, timestamp, nhãn phụ. |
| `--text-sm` | `0.875rem` | 14px | 14px | nhãn UI, nút, ô nhập, hàng bảng. |
| `--text-base` | `1rem` | 16px | 16px | **thân bài. CỐ Ý không co giãn.** |
| `--text-lg` | `clamp(1.0625rem, 1.021rem + 0.19vw, 1.1875rem)` | 17px | 19px | đoạn dẫn, mô tả thẻ. |
| `--text-xl` | `clamp(1.25rem, 1.167rem + 0.37vw, 1.5rem)` | 20px | 24px | tiêu đề thẻ, `h4`. |
| `--text-2xl` | `clamp(1.5rem, 1.374rem + 0.56vw, 1.875rem)` | 24px | 30px | `h3`, tiêu đề khối. |
| `--text-3xl` | `clamp(1.875rem, 1.667rem + 0.93vw, 2.5rem)` | 30px | 40px | `h2`, tiêu đề chặng. |
| `--text-4xl` | `clamp(2.25rem, 1.917rem + 1.48vw, 3.25rem)` | 36px | 52px | `h1` trang trong. |
| `--text-5xl` | `clamp(2.75rem, 2.167rem + 2.59vw, 4.5rem)` | 44px | 72px | **chỉ hero trang chủ.** Một lần trên toàn site. |

**Thân bài KHÔNG co giãn, và đó là điều cố ý.** Một cỡ chữ thân bài trôi theo viewport làm độ
dài dòng đo được thành thứ không đoán được, và đó là lý do thường gặp nhất khiến "fluid type"
đọc ra sai. Chỉ cỡ trình bày mới co giãn; thứ người ta đọc lâu thì cố định.

⛔ **Cấm biểu thức thuần `vw` không có số hạng `rem`.** `font-size: 4vw` bỏ qua hoàn toàn cài
đặt cỡ chữ của người dùng — đó là cách trượt SC 1.4.4 Resize Text. Mọi dòng trên đều có số hạng
`rem` **và** min/max bằng `rem`, nên chỉnh cỡ chữ trình duyệt vẫn dịch chuyển được giá trị. §9
gác điều này bằng một khẳng định tường minh, không phải bằng review mắt.

### 3.3 Giãn dòng và độ dài dòng

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--leading-tight` | `1.15` | `--text-4xl`, `--text-5xl` |
| `--leading-snug` | `1.35` | `--text-2xl`, `--text-3xl` |
| `--leading-normal` | `1.6` | thân bài, mọi cỡ ≤ `--text-xl` |
| `--leading-loose` | `1.75` | văn bài dài trong khoang bài học |
| `--measure` | `68ch` | `max-width` của khối văn xuôi |

**1.6 chứ không 1.5, và lý do là tiếng Việt.** SC 1.4.12 đòi giao diện phải *chịu được*
line-height 1.5; nhưng dấu tiếng Việt xếp chồng cao (`ế`, `ộ`, `ỹ`, `ằ`) nên ở 1.5 dấu của dòng
dưới chạm phần bụng chữ của dòng trên trong đúng những từ có dấu mũ cộng thanh. 1.6 chừa biên
cho chồng dấu, và vẫn còn dư địa khi người dùng ép 1.5 bằng bookmarklet a11y.

`68ch` chứ không `65ch`: `ch` đo theo bề rộng chữ `0`, mà Be Vietnam Pro có chữ hẹp hơn trung
bình, nên `65ch` ở font này ra dòng ngắn hơn ý định.

---

## 4. Khoảng cách

**Không dựng một thang mới.** Tailwind v4 đã có thang khoảng cách sinh từ một biến duy nhất; hợp
đồng này chỉ ghim biến đó:

```css
@theme { --spacing: 0.25rem; }   /* p-4 = 1rem, gap-6 = 1.5rem, … */
```

Khai một bảng `--space-1..24` song song là tạo ra hai nguồn sự thật cho cùng một con số, và lần
sửa thứ hai sẽ lệch. Lane dùng `p-*`, `gap-*`, `space-y-*` bình thường.

Thứ Tailwind **không** cho sẵn là nhịp dọc của một chặng landing page, nên đúng một token bổ
sung:

| Token | Giá trị | @360px | @1440px | Dùng cho |
|---|---|---|---|---|
| `--section-y` | `clamp(3rem, 2rem + 4.44vw, 6rem)` | 48px | **95.94px** | `padding-block` của một phần nội dung trang tiếp thị |

Một token này là lý do trang chủ bảy chặng không cần điểm ngắt nào cho nhịp dọc.

> **Sửa 2026-09-10 — cột @1440px trước đây ghi 96px, và đó là con số SAI.** Chính công thức bên
> trái cho `32 + 1440×0.0444 = 95.936px`, tức nó KHÔNG chạm `max` 6rem tại 1440. Hệ số chạm đúng
> phải ≥ `4.4445vw`; `4.4444vw` vẫn hụt.
>
> Giữ công thức, sửa cột — vì 0.064px không ai thấy được, còn một hệ số năm chữ số thì khó đọc
> hơn hẳn. `packages/ui/src/theme/type-scale.contract.test.ts` ghim **95.936** kèm companion, chứ
> không nới biên độ thành `toBeCloseTo(96, 0)`: biên ±0.5px sẽ nuốt luôn một lần đổi hệ số thật.
> 10/10 dòng §3.2 lọt trong ±0.05px nên đây là lệch riêng lẻ ở đúng dòng này, không phải sai số
> hệ thống của cả bảng.

---

## 5. Bo góc

```css
--radius: 0.75rem;                          /* 12px */
--radius-sm:   calc(var(--radius) - 6px);   /*  6px */
--radius-md:   calc(var(--radius) - 3px);   /*  9px */
--radius-lg:   var(--radius);               /* 12px */
--radius-xl:   calc(var(--radius) + 6px);   /* 18px */
--radius-full: 9999px;
```

| Bậc | Dùng ở |
|---|---|
| `sm` | badge, chip, checkbox, ô nhỏ |
| `md` | button, input, select, textarea |
| `lg` | card, dialog, popover |
| `xl` | panel ứng dụng và modal trên màn rộng; landing không có khối 3D |
| `full` | pill, avatar, đầu nét của cung tiến độ |

**0.75rem chứ không 0.625rem của hệ cũ.** Đây là bậc bo góc của component dùng chung. Landing có bố cục biên tập riêng, không lấy ellipse làm hình trang trí và không dùng lưới thẻ.

⚠ **`--radius` CỐ Ý chỉ khai ở `:root`, cấm lặp ở `.dark`.** Nó là số đo hình học, không phải
màu, và `.dark` đặt trên `<html>` nên `:root` vẫn khớp cùng phần tử — giá trị luôn phân giải
được ở cả hai theme. Lặp lại chỉ tạo thêm một chỗ để quên đồng bộ, đổi lấy con số không. Cùng
luật cho `--motion-*`, `--ease-out`, `--text-*`, `--leading-*`, `--spacing`, `--section-y`, và
cả 5 token `--brand-*`. §9 khẳng định sự vắng mặt đó, để nó là quyết định có cổng gác chứ không
phải một chỗ bỏ sót.

---

## 6. Nâng nền

Ba **bậc ngữ nghĩa**, không phải ba kích cỡ tuỳ ý. Mỗi bậc là hai lớp — một lớp sát (nét tiếp
xúc) và một lớp toả (khối) — vì một lớp duy nhất luôn phải chọn giữa "sắc nét nhưng phẳng" và
"mềm nhưng nhoè".

| Bậc | Nghĩa |
|---|---|
| `--elevation-1` | thẻ lúc nghỉ |
| `--elevation-2` | thẻ lúc hover |
| `--elevation-3` | popover, dropdown, dialog |

**Không có bậc 4.** Dùng sai bậc thì phân cấp thị giác nói dối về thứ đang thật sự nổi lên trên.

```css
/* :root — bóng mang sắc lạnh cùng hue nền, không phải đen thuần */
--elevation-1: 0 1px 2px -1px oklch(0.2 0.03 263.7 / 0.10),
               0 1px 3px  0   oklch(0.2 0.03 263.7 / 0.08);
--elevation-2: 0 2px 4px -2px oklch(0.2 0.03 263.7 / 0.12),
               0 6px 16px -4px oklch(0.2 0.03 263.7 / 0.12);
--elevation-3: 0 4px 8px -4px oklch(0.2 0.03 263.7 / 0.16),
               0 16px 40px -8px oklch(0.2 0.03 263.7 / 0.20);

/* .dark — ĐEN THUẦN, alpha cao hơn hẳn */
--elevation-1: 0 1px 2px -1px oklch(0 0 0 / 0.5), 0 1px 3px  0   oklch(0 0 0 / 0.4);
--elevation-2: 0 2px 4px -2px oklch(0 0 0 / 0.6), 0 6px 16px -4px oklch(0 0 0 / 0.5);
--elevation-3: 0 4px 8px -4px oklch(0 0 0 / 0.7), 0 16px 40px -8px oklch(0 0 0 / 0.6);
```

Bóng "cùng hue nền" của nhánh sáng vô dụng ở nhánh tối: nền vốn đã tối, một bóng chỉ hơi tối hơn
nền thì không nhìn thấy gì. Alpha cao là thứ duy nhất còn tạo được cảm giác nâng lên.

⛔ **Bóng KHÔNG phải cơ chế tương phản.** Một thẻ tách khỏi nền *chỉ* bằng bóng sẽ biến mất với
người bật chế độ tương phản cao của hệ điều hành (Windows High Contrast bỏ `box-shadow`). Mọi
mặt thẻ vì vậy **phải** mang thêm `border-border`, và mọi ranh giới nhận dạng control phải mang
`border-input`.

Bóng đi qua `@theme inline` (`--shadow-elevation-1|2|3`) để sinh class
`shadow-elevation-1|2|3`. **Cấm `shadow-[var(--elevation-1)]`**: dạng arbitrary vẫn đổi theo
theme nhưng bỏ qua bảng theme, nên mỗi chỗ gọi lại tự chọn bậc — đúng thứ mà ba bậc ngữ nghĩa
sinh ra để chặn.

---

## 7. Chuyển động

```css
--motion-fast: 150ms;   /* hover, active, đổi màu, tooltip hiện */
--motion-base: 220ms;   /* mở/đóng panel, chuyển tab, toast vào/ra */
--motion-slow: 320ms;   /* dialog, chuyển chặng, cung tiến độ chạy */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* kế thừa, KHÔNG đổi */
```

Đường cong giảm tốc mạnh: nhanh lúc đầu rồi dừng êm, nên chuyển động cảm thấy "phản hồi tức
thì" thay vì "trôi".

**`prefers-reduced-motion` khai MỘT LẦN ở `globals.css`, không lane nào tự nhớ.** Khối hiện tại
giữ nguyên: bộ chọn phổ quát + `transition-duration: 0.01ms !important`. Dùng `0.01ms` chứ
không `0s` vì thời lượng 0 khiến `transitionend` không bao giờ bắn, làm chết mọi logic chờ sự
kiện đó.

⚠ **Khối CSS đó KHÔNG dừng được một vòng `requestAnimationFrame`.** Design §7.3 gọi đúng tên
lớp lỗi này: nếu chỉ dựa vào nó, trang sẽ *trông như* đã tuân thủ trong khi canvas vẫn chạy. Vì
vậy `packages/motion` phải có **cổng mức JS**, và cung tiến độ ở §8 phải chạy bằng CSS
transition chứ không bằng rAF (xem §8.4).

---

## 8. Motif ellipse cho primitive tiến độ, không áp dụng landing

Cập nhật 2026-09-13: người dùng đã yêu cầu bỏ toàn bộ vòng và 3D khỏi landing. Hero, các phần kể chuyện và ảnh OpenGraph không được dựng lại motif này. Các token/hàm ở packages/motion vẫn phục vụ primitive tiến độ dùng chung; chúng không phải yêu cầu trang trí mọi màn. K8s Arena giữ cảnh riêng theo công năng mô phỏng.

### 8.1 Hình học, trong hệ toạ độ chuẩn hoá

Mọi cung vẽ trong `viewBox="0 0 100 100"`, tâm `(50, 50)`:

| Token | Giá trị | Nghĩa |
|---|---|---|
| `--arc-rx` | `42` | bán trục ngang |
| `--arc-ry` | `30` | bán trục dọc — **ellipse, không phải tròn**; tỉ lệ 1.4 là thứ làm nó đọc ra là logo chứ không phải một spinner bất kỳ |
| `--arc-tilt` | `-22deg` | nghiêng của trục lớn, khớp nét quét chéo của logo |
| `--arc-start` | `120deg` | góc bắt đầu, đo ngược chiều kim đồng hồ từ trục `+x` trong hệ đã nghiêng |
| `--arc-sweep` | `300deg` | tổng góc quét |
| `--arc-gap` | `60deg` | khe hở = `360 − 300`. Đây là thứ làm vòng **hở**; khép nó lại là bỏ motif |

Cung chạy `120° → 420°`, tức khe hở nằm ở nêm `60°..120°` (phía trên bên phải).

### 8.2 Nét

| Token | Giá trị (đơn vị viewBox) | Dùng cho |
|---|---|---|
| `--arc-stroke-hairline` | `2` | cung nhỏ ở góc thẻ danh mục, chấm chỉ mục |
| `--arc-stroke` | `4` | mặc định: thanh tiến độ, trạng thái tải, trạng thái rỗng |
| `--arc-stroke-heavy` | `6` | cung nhiệm vụ trong khoang lab |

Bắt buộc trên mọi phần tử cung:

- `stroke-linecap="round"` — đầu nét bo, khớp `--radius-full`.
- `vector-effect="non-scaling-stroke"` — **không phải trang trí**. Ellipse có tỉ lệ trục 1.4, và
  bất kỳ phép co giãn không đều nào của container cũng làm bề dày nét **biến thiên dọc theo
  cung** nếu thiếu cờ này. Nó hỏng im lặng: cung vẫn vẽ, chỉ là chỗ dày chỗ mỏng.

### 8.3 Ánh xạ tiến độ `0..1` → góc quét

```
θ(p) = --arc-start + p × --arc-sweep       p ∈ [0, 1]
p = 0 → không vẽ gì.   p = 1 → cung khép tới mép xa của khe hở.
```

Cài đặt **bắt buộc** như sau, và đây là ràng buộc kỹ thuật chứ không phải sở thích:

```html
<path d="…" pathLength="1" stroke-dasharray="1" style="stroke-dashoffset: calc(1 - var(--p))" />
```

**Vì sao `pathLength="1"` là đường duy nhất:** chu vi một ellipse **không có công thức sơ cấp**
(nó là tích phân elliptic; mọi thứ đang lưu hành là xấp xỉ kiểu Ramanujan). Một lane tự tính
`2πr` sẽ ra sai số phụ thuộc tỉ lệ trục, và `p = 1` sẽ không khép đúng vào mép khe hở — lệch vài
phần trăm, đủ để nhìn thấy nhưng không đủ để ai gọi tên. `pathLength="1"` bắt trình duyệt tự
chuẩn hoá độ dài thật của đường về đúng `1`, nên ánh xạ `0..1` là **chính xác** ở mọi tỉ lệ.

Các chỗ tiêu thụ tiến độ, cùng một hàm:

| Chỗ | `p` là gì |
|---|---|
| thanh tiến độ bài học | số bước xong / tổng bước |
| bảng nhiệm vụ khoang lab | nhiệm vụ đạt / tổng nhiệm vụ |

**Trạng thái tải** = cung tự vẽ ra rồi tự thu lại, `--motion-slow` mỗi chiều, lặp vô hạn.
**Trạng thái rỗng** = chính vòng ellipse hở, bên trong không có gì.

### 8.4 Cung chạy bằng CSS transition, KHÔNG bằng rAF

```css
transition: stroke-dashoffset var(--motion-slow) var(--ease-out);
```

Lý do là §7: khối `prefers-reduced-motion` hiện có phủ được `transition-duration` bằng
`!important`, nhưng **không** dừng được `requestAnimationFrame`. Đẩy cung sang CSS làm nó tự
động tuân thủ reduced-motion mà không cần thêm một cổng nào. Một cung chạy bằng rAF sẽ *trông
như* tuân thủ trong khi nó vẫn quay — đúng lớp lỗi "xanh mà không chứng minh gì".

Landing không còn canvas/rAF hoặc cảnh 3D. Cảnh K8s Arena vẫn phải kiểm soát chuyển động ở mức JS; CSS reduced-motion không thể tự dừng rAF.

### 8.5 Màu của cung

Cung dùng `stroke: currentColor`, không dùng token màu trực tiếp. Chỗ gọi quyết định màu bằng
`text-*`, nên cung tự thừa hưởng đúng ngữ nghĩa của bề mặt nó nằm trên và không cần một token
màu riêng — đó là cách duy nhất giữ danh sách token đóng ở §1.

Phần cung **chưa** đi qua (rãnh) dùng `stroke: var(--border)` khi nó thuần trang trí, và
`stroke: var(--input)` khi bản thân cung là một control đọc được (thanh tiến độ có
`role="progressbar"`) — vì lúc đó SC 1.4.11 áp vào nó.

---

## 9. Luật cứng: JSX không bao giờ mang màu trần

**Luật (giữ nguyên từ hệ hiện tại, không nới):** trong `apps/web/src`, `packages/ui/src`,
`packages/motion/src`, `packages/copy/src` — không `#hex`, không `0xRRGGBB`, không
`slate|gray|zinc|neutral-N`. Màu chỉ đến từ class ngữ nghĩa (`bg-background`,
`text-muted-foreground`, `border-input`, …). `globals.css` là nguồn duy nhất.

Lệnh chứng minh (chạy từ gốc repo, Git Bash):

```bash
grep -rnE "#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b|\b(slate|gray|zinc|neutral)-(50|[1-9]00|950)\b" \
  --include="*.ts" --include="*.tsx" --include="*.css" \
  apps/web/src packages/ui/src packages/motion/src packages/copy/src packages/terminal/src \
  | grep -vE "\.(test|spec)\.tsx?:" \
  | grep -vE ":[0-9]+:[[:space:]]*(//|/\*|\*)" \
  | grep -v "packages/terminal/src/.*themes\.ts:"
```

**Kết quả phải là 0 dòng.** Một dòng bất kỳ là vi phạm.

### 9.1 Ngoại lệ được phép — đúng MỘT

`packages/terminal/src/**/themes.ts` — bảng ANSI của xterm. Lý do không phải là "cho qua": xterm
nhận màu qua **API JavaScript** (`ITheme`), không qua CSS, nên nó **không đọc được**
`var(--token)`. Đó là **dữ liệu cấu hình**, không phải class Tailwind. Không có ngoại lệ thứ hai.

### 9.2 Lệnh grep trên là phép soi tay. Cổng thật là script.

`pnpm tokens:check` (`scripts/check-design-tokens.mjs`) là cổng, và lệnh grep **không** thay
được nó. Ba lý do đã đo, ghi ở `docs/design-system.md` §7a:

1. **Không job CI nào chạy grep** (grep toàn bộ `.github/workflows/`: 0 kết quả). Lệnh nằm trong
   plan chỉ chạy khi có người nhớ chạy.
2. **Bản grep cũ kêu oan 5/5 lần** — cả năm kết quả đều là `#fff` trong **chú thích** hoặc trong
   thông điệp assertion mô tả một lỗi đã sửa. Cổng mà 100% đầu ra là báo động giả thì bị tắt
   trong hai tuần. Hai vế `grep -v` ở trên bù được phần lớn nhưng không phải tất cả.
3. **Vùng quét thủng** — bản cũ `--include=*.tsx` bỏ qua mọi `.ts` và `.css`.

`globals.css` chứa `slate-*` và `#hex` **trong chú thích** một cách chính đáng (bằng chứng đo
được của lỗi `@source` 2026-08-13 và hai giá trị sRGB của lần sửa contrast `--input`). Một file
CSS token đương nhiên chứa giá trị màu — nó nằm ngoài phạm vi grep có chủ ý, và §9 không quét
`apps/web/src/app/globals.css` như một file vi phạm.

Sổ ngoại lệ của script chạy **hai chiều**: file có màu cứng mà không có trong sổ ⇒ đỏ; dòng
trong sổ mà nay đã sạch ⇒ **cũng đỏ**, và việc phải làm là xoá dòng đó.

---

## 10. Ô nghiệm thu

Hợp đồng này chỉ có giá trị khi có cổng gác. Dưới đây là các test **phải tồn tại** trước khi bất
kỳ lane nào ngoài L0 được spawn.

### AC-1 · `packages/ui/src/theme/tokens.contract.test.ts` — sự tồn tại

- 24 token ngữ nghĩa ở §1.4 có mặt ở **cả** `:root` lẫn `.dark`.
- Mỗi token màu có một dòng `--color-*` tương ứng trong `@theme inline`.
  *Hỏng này im lặng tuyệt đối:* thiếu map thì class `bg-x` không được Tailwind sinh ra, JSX vẫn
  biên dịch, thuộc tính `class` vẫn có trong HTML, chỉ là không luật CSS nào khớp.
- **Khẳng định VẮNG MẶT ở `.dark`:** `--radius`, `--motion-fast|base|slow`, `--ease-out`, 5
  token `--brand-*`, toàn bộ `--text-*`, `--leading-*`, `--measure`, `--spacing`, `--section-y`,
  và các token `--arc-*`. Đây là quyết định có cổng, không phải chỗ bỏ sót.

### AC-2 · Bảng tương phản §1.6, tính lại từ chính `globals.css`

- Mọi dòng đạt ngưỡng của nó. Hạ một token xuống dưới ngưỡng ⇒ suite `packages/ui` đỏ.
- **Trộn alpha trong sRGB đã mã hoá gamma.** Test chạy **song song** cả hai công thức trên cùng
  một cặp và khẳng định chúng **khác nhau**: `oklch(1 0 0 / 12%)` trên `#070A11` phải ra
  `#25272E` / **1.33:1** ở công thức đúng, và ra một giá trị khác hẳn ở vế linear-light. Đổi
  ngược về linear-light là **ĐỎ**, không phải "số đẹp lên". Đây là §1a của
  `docs/design-system.md` biến thành cổng.
- **Kiểm gamut:** mọi bộ ba oklch quy về sRGB phải có cả ba kênh trong `[0, 1]`. Ngoài gamut thì
  trình duyệt gamut-map (giảm chroma, giữ L/H) còn phép đo lại clamp từng kênh — hai phép chiếu
  khác nhau, và khi đó **số đo không còn tả đúng thứ hiển thị**. Sổ `KNOWN_OUT_OF_GAMUT` chạy
  hai chiều.
- `--ring === --primary` ở cả hai theme. Đây là **điều kiện còn hiệu lực** của miễn trừ ở §1.7;
  ngày nào `--ring` có giá trị riêng thì test đỏ và cặp `--ring`/`--primary` phải quay lại bảng
  đo, vì lúc đó nó đo được thật.
- `--brand-star` / `--background` sáng < 3.0 (pin **1.23**) — khẳng định lệnh cấm ở §1.5 là một
  con số, không phải một lời dặn.

### AC-3 · Đối chứng dương — chứng minh cổng ĐỎ được

Bắt buộc. Một cổng chưa từng thấy đỏ thì chưa được chứng minh là đang gác gì.

1. **Token bị bẻ gãy có chủ đích.** Chạy lại toàn bộ pipeline AC-2 trên một bảng token giả trong
   đó `--primary` bị ép thành `oklch(0.75 0.10 26.7)` (≈2.3:1 với chữ trắng) và **đòi lượt chạy
   đó THẤT BẠI**. Nếu nó xanh, phép đo hỏng chứ không phải token tốt.
2. **Cặp có đáp án biết trước, độc lập với mọi token.** Trắng/đen = **21.00:1**;
   `#BC2626` trên trắng = **6.10:1**; `#EFF003` trên trắng = **1.23:1**; `#373D4E` trên trắng =
   **10.83:1**. Lệch một dòng ⇒ mã đo sai, không phải màu sai. Đây là cùng khuôn với đối chứng
   dương mà `docs/design-system.md` §7 đã mô tả, và nó thay cho đối chứng cũ vốn chỉ khẳng định
   "4.01 < 9.48", tức xác nhận một con số sai nhỏ hơn một con số khác.
3. **Tự kiểm của `tokens:check`.** Giữ nguyên hành vi hiện tại: 13 mẫu bẩn phải bị bắt, 20 mẫu
   sạch không được kêu, tự kiểm hỏng thì **thoát 2 và không quét gì cả**.

### AC-4 · Luật hai kênh (`button.test.tsx`, `badge.test.tsx`)

- `variant="primary"` render class nền **đặc** và **không** có icon mặc định.
- `variant="destructive"` render `bg-transparent` + `border-destructive` + một `TriangleAlert`
  mang `aria-hidden="true"`. Thiếu icon ⇒ đỏ.
- **Khẳng định khử màu:** độ chói tương đối của mặt `primary` lúc nghỉ so với mặt `destructive`
  lúc nghỉ ≥ **3.0:1** ở cả hai theme (đo được 6.0885 sáng / 6.3056 tối trên background; 5.7071 tối trên card). Đây là thứ chứng minh luật
  sống sót khi bỏ hết sắc độ.
- jsdom không tính computed style, nên phép gác là **class quyết định màu**, không phải sự tồn
  tại phần tử — kiểm sự tồn tại là một test không bao giờ đỏ được.

### AC-5 · Xoá absence pin cũ, không ghim lại

`--destructive`/`--muted` sáng nay đạt **5.94:1**. Absence pin ở
`tokens.contract.test.ts` (ghim khoảng trống 4.37) **phải bị xoá**, và cặp này **phải được thêm**
vào `TEXT_PAIRS` ở cả hai theme (sáng 5.94, tối 5.33). Đặt một pin mới ở giá trị mới là biến một
lần sửa thành baseline vĩnh viễn — `rules/pinned-baseline-test-companion.md` cấm đúng điều đó.
Cùng lúc, xoá câu "Đừng đặt nút/badge destructive vào khối `bg-muted` ở nhánh sáng" khỏi
`docs/design-system.md` §1c.

### AC-6 · Thang chữ

- Mỗi `--text-*` **được tính giá trị**, không đọc bằng mắt: bằng min đã ghim tại viewport 360px
  và bằng max đã ghim tại 1440px (bảng §3.2).
- **Không `--text-*` nào là biểu thức thuần `vw`**: mọi giá trị hoặc là `rem` cố định, hoặc là
  `clamp()` có số hạng `rem` **và** min/max bằng `rem`. Đây là cổng cho SC 1.4.4.
- `--font-sans` bắt đầu bằng `var(--font-be-vietnam-pro)`; `--font-mono` bắt đầu bằng
  `ui-monospace` và chứa **0 lần** `url(` và **0 lần** `@font-face`.
- Lời gọi `next/font/google` trong `apps/web/src/app/layout.tsx` **không đổi** — test khẳng định
  subset `vietnamese` còn nguyên.

### AC-7 · Motif (`packages/motion`)

- Phần tử cung mang `pathLength="1"` và `vector-effect="non-scaling-stroke"`.
- `stroke-dashoffset` bằng `1` tại `p=0`, `0` tại `p=1`, và tuyến tính ở ba giá trị `p` lấy mẫu
  giữa chừng.
- Module tiến độ chứa **0 lần** `requestAnimationFrame`. **Đối chứng dương:** một fixture cố ý
  dùng rAF phải bị bắt — nếu không, phép kiểm này chỉ là một `grep` may mắn.
- Ép `prefers-reduced-motion: reduce` ⇒ `transition-duration` của cung phân giải ra `0.01ms`.
- Cung dùng `stroke: currentColor`, không hardcode token màu (bắt bởi AC-8 luôn).

### AC-8 · Màu trần

- `pnpm tokens:check` **được nối vào CI**, không chỉ tồn tại trong repo. Một script không ai gọi
  thì không gác gì.
- Lệnh grep §9 trả **0 dòng**.
- Sổ ngoại lệ có **đúng một** entry mức file: `packages/terminal/src/**/themes.ts`. Xoá một vi
  phạm thật khỏi mã mà để dòng sổ lại ⇒ **đỏ** (sổ hai chiều).

### AC-9 · Hợp đồng bốn trạng thái

Giữ nguyên `design-system.contract.test.tsx` kèm đối chứng dương của nó: chạy phép kiểm trên ba
bản markdown **đã bị bẻ gãy có chủ đích** (thêm một component ma, xoá một dòng thật, làm rỗng một
ô trạng thái) và đòi cả ba lượt phải đỏ.

### AC-10 · Suite

`pnpm -w turbo run build lint typecheck test` xanh. **Đọc dòng `Tasks: X/Y` trước khi trích bất
kỳ con số test nào** — turbo dừng sau task đỏ, và các suite phía sau khi đó **chưa chạy**, nên
một báo cáo trích số từ lượt đó đang mô tả một phần suite mà nó tưởng là toàn bộ.

### Khi một cổng đỏ

Sửa **token**, không hạ ngưỡng, không thêm tên vào danh sách miễn trừ — trừ khi đó thật sự là
một quyết định mới, và khi đó phải sửa chính tài liệu này **trong cùng commit**.


# Sơ đồ TikZ trong bài học và lab

Tác giả viết sơ đồ bằng TikZ. Repo lưu cả nguồn `.tex` lẫn một SVG đã làm sạch nằm ngay cạnh. CI không cài TeX: nó chỉ kiểm SVG còn khớp với nguồn và vẫn nằm trong danh sách cho phép. Hợp đồng gốc là `plans/labs-rebuild/contracts.md` §C4; file này là hướng dẫn dùng.

```
content/scenarios/<id>/diagrams/layers.tex    ← bạn viết
content/scenarios/<id>/diagrams/layers.svg    ← pnpm diagrams:build sinh ra, commit cùng .tex
content/scenarios/<id>/step2.md               ← ![Mô tả…](diagrams/layers.svg "Chú thích")
```

## Cài đặt (chỉ người soạn sơ đồ cần)

- XeLaTeX và dvisvgm ≥ 3.0 trên `PATH`. Windows: MiKTeX. Linux/macOS: TeX Live với `texlive-xetex`, `texlive-pictures`, `texlive-latex-extra` và `dvisvgm`.
- Gói LaTeX dùng tới: `standalone`, `pgf`/TikZ, `fontspec`, `xcolor`. MiKTeX cài tự động lúc dựng đầu tiên bị TẮT (`-disable-installer`), nên thiếu gói thì build báo lỗi chứ không lặng lẽ tải về.
- Font đã nằm trong repo (`scripts/diagrams/fonts/`, xem README ở đó). Không cần cài font nào.

Kiểm nhanh: `pnpm diagrams:build --force scripts/diagrams/examples` phải dựng xong 7 ví dụ.

## Viết một sơ đồ

File `.tex` chỉ chứa MỘT `tikzpicture`, có thể kèm dòng `\usetikzlibrary{…}` ở đầu. Không `\documentclass`, không `\usepackage`, không `\definecolor`: preamble chung (`scripts/diagrams/dlp-diagram.sty`) lo phông, màu và style. Dòng `% Mô tả: …` đầu file là tuỳ chọn; trang xem trước dùng nó làm chú thích.

```latex
% Mô tả: Service chọn pod theo nhãn
\begin{tikzpicture}
  \node[card=blue] (svc) {\dlptitle{Service \dlpcode{web}}\dlpcode{10.96.0.12:80}};
  \node[box=green, right=14mm of svc] (pod) {Pod \dlpcode{web-7d9f}\\\small Ready};
  \draw[flow=green] (svc) -- node[lbl, above=3pt] {khớp selector} (pod);
\end{tikzpicture}
```

Rồi `pnpm diagrams:build content/scenarios/<id>/diagrams/` và commit cả `.tex` lẫn `.svg`.

## Bảng màu

Chỉ dùng chín tên dưới đây. SSOT là `scripts/diagrams/palette.json`; preamble tự `\definecolor` từ đó. Hex trong bảng là màu TeX vẽ và cũng là màu fallback ghi vào SVG.

| Tên TeX | Hex sáng | Gợi ý tối | Dùng cho | Tương phản trên #FFFFFF / #111624 |
|---|---|---|---|---|
| `dlpink` | #141A2B | #ECEAE3 | chữ, nét chính; trong SVG thành `currentColor` | theo màu chữ của trang |
| `dlpmuted` | #5B6275 | #9AA1B2 | nét phụ, chú thích, trục | 6.09 / 2.96 (fallback), 6.97 với CSS tối |
| `dlppaper` | #FFFFFF | #111624 | nền đục che nét phía sau (thẻ, nhãn trên mũi tên) | |
| `dlpblue` | #3474E0 | = | thành phần chính, pod, commit | 4.45 / 4.06 |
| `dlpgreen` | #1E8A5A | = | đạt, Ready, bản mới | 4.34 / 4.16 |
| `dlpamber` | #B7791F | = | cảnh báo, lớp ghi được, đang chuyển | 3.64 / 4.96 |
| `dlpred` | #D2484E | = | lỗi, trượt, bị xoá | 4.40 / 4.10 |
| `dlpviolet` | #875FD8 | = | cụm, control plane, ref git | 4.51 / 4.00 |
| `dlpteal` | #138A8A | = | mạng, node, volume | 4.17 / 4.32 |

Màu nhấn dùng một hex cho cả hai theme và đều đạt ≥ 3:1 trên cả hai mặt nền (`diagrams:check` kiểm lại mỗi lượt, đổi palette mà rớt ngưỡng là đỏ).

**Không pha màu.** `dlpblue!15` bị TeX trộn với trắng thành một hex mới: mất mã màu, theme tối không đổi được, và sang nền tối thì thành một mảng trắng đục. Build từ chối. Muốn nhạt thì dùng độ đục: các style `box`, `card`, `layer`… đã tự làm (`fill opacity=0.12` trên nền `dlppaper`), còn tự vẽ thì `fill=dlpblue, fill opacity=0.12`.

## Style

Tham số trong `=…` là tên màu không có tiền tố `dlp` (`box=green`). Bỏ trống thì dùng mặc định trong ngoặc.

| Style / lệnh | Dùng | Ví dụ |
|---|---|---|
| `box[=màu]` (ink) | hộp bo góc, nền nhạt cùng màu viền | `request-flow.tex` |
| `card[=màu]` + `\dlptitle{…}` | thẻ có dòng tiêu đề đậm, căn trái | `\node[card=violet] {\dlptitle{Ingress}nginx};` |
| `layer[=màu]`, `stacked on=<node>`, `layer width=<dài>` | lớp image chồng lên nhau, chữ mono | `image-layers.tex` |
| `zone={màu}{tiêu đề}`, `cluster=…`, `host=…`, `pod=…` | vùng lồng nhau, dùng với `fit=(a)(b)`; tiêu đề đè lên mép trên | `pod-nesting.tex` |
| `container[=màu]` | hộp chữ mono cho container | `pod-nesting.tex` |
| `flow[=màu]`, `both[=màu]`, `link[=màu]` | mũi tên một chiều, hai chiều, đường nối | mọi ví dụ |
| `faint` | nét đứt mờ: quan hệ phụ, chú thích trỏ vào | `file-tree.tex` |
| `lbl` | nhãn trên mũi tên, có nền giấy che nét | `node[lbl, above=3pt] {:443}` |
| `note` | chữ chú thích màu muted | |
| `commit[=màu]` (blue), `ghost commit` | nút commit; commit chưa có | `git-dag.tex` |
| `parent` | mũi tên từ commit con về commit cha (đúng chiều git lưu) | `\draw[parent] (b) -- (a);` |
| `ref[=màu]` (violet), `pointer[=màu]` | nhãn nhánh/HEAD và mũi tên trỏ | `git-dag.tex` |
| `net[=màu]` (teal), `port[=màu]`, `iface` | bridge/interface, cổng, tên interface | `docker-bridge.tex` |
| `\dlprow`, `\dlpspan`, `\dlpevent`, `\dlpaxis`, `\dlptick` | dòng thời gian (probe, rolling update) | `rolling-update.tex` |
| `\dlpfile[tuỳ chọn]{độ sâu}{tên}` | cây thư mục, mỗi lệnh một dòng; node tên `file-0`, `file-1`… | `file-tree.tex` |
| `hl[=màu]` (amber) | tô sáng một node, vd. `\dlpfile[hl]{1}{Dockerfile}` | `file-tree.tex` |
| `\dlpcode{…}`, `\dlpmuted{…}`, `\dlpsha{…}` | chữ mono, chữ mờ, mã commit | |

Ví dụ đầy đủ và cách chúng hiện trên hai nền: `scripts/diagrams/examples/*.tex` và `scripts/diagrams/examples/preview.html` (mở thẳng trong trình duyệt).

## Luật

1. Một file, một `tikzpicture`. Chỉ màu trong bảng, không pha màu. Không `\input`, `\write`, `\special` và các lệnh đọc/ghi khác (build từ chối).
2. Markdown: `![Mô tả cho người đọc màn hình](diagrams/<tên>.svg "Chú thích hiện dưới hình")` đứng riêng một dòng. Alt bắt buộc, ít nhất 20 ký tự, nói được hình chứa gì (SVG chỉ có `role="img"`, không có `<title>`: tên truy cập đến từ alt của markdown).
3. Bề rộng tự nhiên ≤ 760px. Rộng hơn thì cột nội dung thu nhỏ hình và chữ nhỏ theo; build in cảnh báo.
4. Chỉ dùng ký tự có trong font. XeTeX vốn chỉ ghi log rồi bỏ chữ thiếu; build biến log đó thành lỗi (ví dụ `⎈` hay chữ Hán sẽ bị từ chối).
5. Không sửa `.svg` bằng tay. Băm `out` ở dòng đầu bắt mọi sửa tay; sửa `.tex` rồi dựng lại.
6. Tên tệp: `content/{scenarios,labs}/<id>/diagrams/<tên>.tex`, `<tên>` chữ thường có gạch nối.

## Lệnh

| Lệnh | Việc |
|---|---|
| `pnpm diagrams:build` | dựng mọi `content/**/diagrams/*.tex` và ví dụ; sơ đồ có băm nguồn chưa đổi thì bỏ qua |
| `pnpm diagrams:build <file.tex hoặc thư mục>…` | chỉ dựng những nguồn đó |
| `… --force` | dựng lại cả khi băm chưa đổi |
| `… --keep` | giữ thư mục tạm (`main.tex`, `main.log`, `raw.svg`) để soi lỗi TeX |
| `pnpm diagrams:check` | cổng CI; không cần TeX, không cần `pnpm install` |

Lỗi TeX được dịch về số dòng của file nguồn (`→ dòng 6 của file nguồn`). Build chạy song song tối đa 4 sơ đồ và cho ra byte y hệt nhau giữa các lần chạy.

## Cổng CI kiểm gì

`scripts/diagrams/check.mjs` chạy trong job `ts` của `.github/workflows/ci.yml`, ngay sau env-check:

- mỗi `.tex` có `.svg`; mỗi `.svg` có `.tex` (không có SVG mồ côi);
- `src=` khớp băm của thân `.tex` cộng bộ công cụ (`palette.json`, `dlp-diagram.sty`, `lib/pipeline.mjs`, `lib/svg.mjs`, font). Sửa bảng màu, preamble hay font mà quên dựng lại thì MỌI sơ đồ đỏ;
- `out=` khớp băm phần SVG còn lại, nên sửa tay bị bắt;
- danh sách cho phép: phần tử `svg g path use defs symbol title desc rect circle ellipse line polyline polygon clipPath`; thuộc tính hình học, `transform`, họ `fill`/`stroke`, độ đục, `class`, `id`, `href` chỉ dạng `#id` nội bộ; mọi `id` mang tiền tố của sơ đồ; màu chỉ trong bảng, màu ink phải là `currentColor`, màu khác phải kèm class đúng;
- màu nhấn đạt ≥ 3:1 trên cả hai mặt nền.

Trước khi kiểm thật, script tự làm hỏng một ví dụ theo 11 kiểu (sửa nguồn, sửa tay, chèn `<script>`, `onload`, `href` ra ngoài, `style`, màu lạ, `id` không tiền tố, phần tử lạ…) và đòi kiểu nào cũng đỏ. Không bắt được thì cổng tự đỏ, không bao giờ xanh khống.

## SVG đầu ra (cho FE)

```html
<!-- dlp-diagram v1 src=<sha256> out=<sha256> -->
<svg xmlns="http://www.w3.org/2000/svg" width="537" height="166" viewBox="…" role="img">
<defs><path id="dia-5e63ed38c2-g0-189" d="…"/>…</defs>
…<g fill="#1e8a5a" stroke="#1e8a5a" class="dia-s-green dia-f-green">…
```

- Chữ là glyph `<path>` + `<use>`, không nhúng font: hợp CSP `font-src 'self'` và hiện giống hệt ở mọi máy. Đổi lại mỗi sơ đồ nặng khoảng 30–38 KiB, phần lớn là glyph (tiếng Việt có nhiều chữ dựng sẵn dấu); gzip còn 6–10 KiB.
- `id` mang tiền tố `dia-<10 ký tự đầu của src>-`, nên nhiều sơ đồ khác nhau nhúng inline cùng trang không đụng nhau. Cùng MỘT sơ đồ nhúng hai lần trên một trang thì id vẫn trùng; khi đó FE phải đổi tiền tố cho bản thứ hai (preview.html làm đúng việc đó).
- Màu ink là `currentColor`: SVG theo màu chữ của khối chứa nó.
- Màu khác: hex sáng nằm trong thuộc tính `fill`/`stroke` (fallback khi không có CSS) cộng class `dia-f-<tên>`/`dia-s-<tên>`. Không bao giờ có `style="…"` inline, nên CSS theme của FE luôn thắng. Bảng CSS khởi điểm cho hai theme do `themeCss()` trong `scripts/diagrams/preview.mjs` sinh ra:

```css
.theme-dark .dia-f-paper { fill: #111624 }   /* phải bằng màu mặt nền đặt sơ đồ lên */
.theme-dark .dia-s-muted { stroke: #9AA1B2 }
.theme-dark .dia-f-muted { fill: #9AA1B2 }
/* blue/green/amber/red/violet/teal: giữ hex sáng hoặc theo bảng ở trên */
```

`dia-f-paper` là chỗ dễ sai nhất: nó che nét phía sau nhãn và thẻ, nên phải trùng màu mặt nền thật. Đặt sơ đồ lên #0A0D14 mà paper vẫn #111624 thì mỗi nhãn thành một ô vuông.

## Bẫy đã gặp

- **Tiêu đề thẻ**: viết bằng `\dlptitle{…}` trong thân node. Làm bằng `execute at begin node` thì TikZ chạy nó ngoài phần gom dòng của `align` và tiêu đề rơi sang dòng khác.
- **Toạ độ dòng thời gian không đơn vị**: TikZ đọc `(2,-1cm)` thành `(2pt,-1cm)`. Các lệnh `\dlp…` của dòng thời gian đều dùng số trần (1 = 1cm).
- **Ký tự đặc biệt của TeX**: `_ # $ % & { }` phải thoát (`node\_modules/`). `"` và `[ ]` trong thân node thì dùng thẳng được.
- **Git Bash heredoc nuốt dấu `\`**: tạo `.tex` bằng trình soạn thảo, đừng bằng `cat <<EOF`; `\\` thành `\` và TeX báo lỗi khó hiểu.
- **dvisvgm xếp `<defs>` không ổn định** giữa hai lần chạy; hậu xử lý sắp lại theo id. Nếu một ngày `check` đỏ ở `out` ngay sau khi dựng, nghi chỗ này trước.

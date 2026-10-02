# Font của sơ đồ

Chép vào repo để `pnpm diagrams:build` không bao giờ phụ thuộc font hệ thống hay font của MiKTeX/TeX Live. Cả hai họ đều theo SIL Open Font License 1.1 (`OFL.txt` nằm cạnh từng họ). Mọi URL dưới đây đã kiểm trả HTTP 200 ngày 2026-10-03, và đều ghim vào commit/tag cố định nên tải lại vẫn ra đúng byte.

| File | Phiên bản (bảng `name`, ID 5) | Nguồn | sha256 |
|---|---|---|---|
| `BeVietnamPro/BeVietnamPro-Regular.ttf` | 1.002 | `https://raw.githubusercontent.com/google/fonts/c13390277dfb1fcc7415d84ef7ef9cfc1e52f8c1/ofl/bevietnampro/BeVietnamPro-Regular.ttf` | `cd1ef6e9d7db28ad5cdb88a65ccbe693870e60d340b791f349d248342b4fe4c3` |
| `BeVietnamPro/BeVietnamPro-SemiBold.ttf` | 1.002 | cùng thư mục, `BeVietnamPro-SemiBold.ttf` | `bd8e27eb02720b9d91e59e4f10a90878643219f25ce6a8d9a4f06a8a88d3bb71` |
| `BeVietnamPro/BeVietnamPro-Bold.ttf` | 1.002 | cùng thư mục, `BeVietnamPro-Bold.ttf` | `7f738fe5c43c8872807b20e2d30d42163618de8a4daf7f48a939adac32c16847` |
| `BeVietnamPro/OFL.txt` | | cùng thư mục, `OFL.txt` | `6b7f8f73609a25ea78c891e34cf37b06f8a676b7ea986e941e43b009110f2a85` |
| `JetBrainsMono/JetBrainsMono-Regular.ttf` | 2.304 | `https://raw.githubusercontent.com/JetBrains/JetBrainsMono/v2.304/fonts/ttf/JetBrainsMono-Regular.ttf` (tag `v2.304` = commit `cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9`) | `a0bf60ef0f83c5ed4d7a75d45838548b1f6873372dfac88f71804491898d138f` |
| `JetBrainsMono/OFL.txt` | | `https://raw.githubusercontent.com/JetBrains/JetBrainsMono/v2.304/OFL.txt` | `30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad` |

Be Vietnam Pro: commit `c133902` là commit mới nhất chạm `ofl/bevietnampro` trên `google/fonts` lúc tải (2026-03-03).

## Dùng ở đâu

- `dlp-diagram.sty`: `\setsansfont`/`\setmainfont` (Regular, đậm = SemiBold), `\setmonofont` (JetBrains Mono, tắt ghép chữ để `!=`, `->` hiện đúng ký tự), `\dlpheavy` (Bold).
- `build.mjs` chép cả thư mục này sang thư mục tạm cạnh `main.tex`; `Path=./fonts/…` trỏ vào đó.
- SVG đầu ra KHÔNG nhúng font (`dvisvgm --no-fonts`): chữ thành `<path>` glyph, nên trang web không cần tải font nào và CSP `font-src 'self'` không bị chạm.

## Đổi font

Mọi file `.ttf`/`.otf` ở đây nằm trong băm nguồn (`lib/sources.mjs`). Thay hay thêm một file thì `pnpm diagrams:check` đỏ cho mọi sơ đồ cho tới khi chạy `pnpm diagrams:build` và commit lại các SVG. Ghi lại nguồn + phiên bản + sha256 vào bảng trên trong cùng commit.

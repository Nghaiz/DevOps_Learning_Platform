# Ảnh chụp giao diện P13 — trước và sau lượt thiết kế lại (2026-09-06)

Chụp bằng Playwright trên cụm thật `https://dlp.192.168.94.130.sslip.io:30443`, viewport 1440×900.

| file | trạng thái | ghi chú |
|---|---|---|
| `lessons.jpeg` | TRƯỚC | chụp ở viewport mặc định của MCP, TRƯỚC lệnh resize — thẻ bị cắt ở mép phải là do khung chụp, không phải lỗi bố cục. Đã đo lại: `scrollWidth == clientWidth`, 0 phần tử tràn. |
| `lessons2.jpeg` | TRƯỚC | 1440px thật. Thẻ là hộp chữ, không icon, không dải màu, không bóng. |
| `home.jpeg` | TRƯỚC | hơn nửa màn hình dưới nếp gấp bỏ trống. |
| `paths-seeded.jpeg` | GIỮA | nội dung đã seed nhưng ảnh web còn CŨ — cho thấy dữ liệu và thiết kế là hai việc tách rời. |
| `new-lessons.jpeg` | SAU | dải màu độ khó ở viền trái, badge có hình riêng, meta có icon, dòng đếm "8 bài học". |
| `new-home.jpeg` | SAU | bốn dải: hero · bốn ô đếm THẬT · ba thẻ giá trị · ba bước bắt đầu. |

Số trên trang chủ đọc qua `publishedContentSource()` — cùng nguồn ba trang danh mục dùng, không hằng số. Khi đọc hỏng nó hiện "chưa đọc được", KHÔNG hiện `0`.

# Giao diện thực hành

## Phạm vi thay đổi

- `/` và `/games`: chung màn chọn game, tìm kiếm không dấu, lọc chủ đề, phân biệt game có thể chơi với game đang phát triển. Minh họa SVG không cần WebGL.
- Vỏ ứng dụng: thanh bên theo vai trò, điều hướng di động, tài khoản, giao diện sáng/tối và cảnh báo dung lượng sandbox.
- `/problems`: chọn game ở đầu trang, thu gọn bộ lọc phụ, bảng sáu cột. Chủ đề và đường vào game vẫn lấy từ dữ liệu hiện có.
- Trang chi tiết problem: điều kiện chấm, gợi ý và lịch sử nộp ở các tab riêng.
- Problem creator: chọn game bằng radio, điều hướng các phần ở bên trái, thanh lưu cố định và công cụ định dạng Markdown.
- Soạn bài học/lab: bố cục rộng hơn, phân khối nội dung và thanh lưu cố định.
- Kỳ thi: bộ lọc theo trạng thái, thẻ kỳ thi, khung làm bài và form tạo kỳ thi thu gọn.
- Level Builder Git: `/games/git?mode=builder` mở thẳng sandbox và bảng dựng màn; giữ bản nháp khi chuyển sang chơi thử theo luồng có sẵn.
- Kubernetes: liên kết từng chương, lối về Games, vùng cuộn riêng. Chỉ nạp ArenaRoot khi người dùng chọn một màn.

## Cách duy trì

`apps/web/src/app/practice.css` chứa hệ màu và bố cục mới, được nhập sau `globals.css`. Các game giữ bảng màu mô phỏng riêng. Không thêm thư viện hoặc thay đổi API, phân quyền, cách chấm bài hay dữ liệu người học.

Các thay đổi Git Odyssey có sẵn trong workspace được giữ lại; tài liệu này chỉ ghi phạm vi thiết kế chung của lượt làm việc này.

## Giới hạn xác nhận

Theo yêu cầu, không chạy test, smoke test, lint, typecheck hoặc build. Chưa xác nhận giao diện bằng trình duyệt hay xác nhận các lỗi runtime đã hết. Những thay đổi về token, nội dung và bố cục có thể cần cập nhật các kiểm tra giao diện cũ khi việc chạy kiểm tra được cho phép trở lại.

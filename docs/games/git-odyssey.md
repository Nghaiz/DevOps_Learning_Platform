# Git Odyssey — thiết kế lại Git Game

## Trải nghiệm

Git là một hành trình qua các trạm lịch sử. Người chơi đọc nhiệm vụ, quan sát kho,
gõ lệnh thật, nhìn thay đổi trên bản đồ, rồi mở trạm kế tiếp. Engine và tiêu chí
chấm hiện có vẫn là nguồn dữ liệu cho trò chơi.

- **Quần đảo khởi nguyên:** xanh ngọc, học commit và nắn lịch sử.
- **Thành phố kết nối:** tím, làm việc nhóm và đồng bộ kho từ xa.
- **Vùng thời gian thất lạc:** cam san hô, lần theo dấu vết và cứu hộ.
- Mốc đã ghé thăm/đã hoàn thành lưu cục bộ. Chơi lại mở phiên mới.

## Hình ảnh và chuyển động

SVG tùy biến cho đảo nổi, tháp tín hiệu, quỹ đạo, sao và trạm commit.
Lucide cung cấp bộ biểu tượng; Framer Motion qua `@devops-platform/motion/react`
di chuyển node và hiện tuyến kết nối. CSS tạo chuyển động đảo, dòng tín hiệu,
ánh sáng, phản hồi mục tiêu và confetti khi hoàn thành.

Màu của làn là trang trí. Trạng thái Git vẫn có màu, hình dạng, ký hiệu và nhãn
đọc bằng trình đọc màn hình. Chọn commit mở thông tin tác giả, cha và trạng thái.
Bản đồ hỗ trợ bàn phím, cuộn, zoom và tắt hiệu ứng. Giảm chuyển động theo hệ điều hành.

## Bố cục chung

1. Thanh trên: bài hiện tại, số lệnh, chuyển 2D/3D và thao tác nộp OJ.
2. Dải nhiệm vụ ngắn.
3. Bản đồ lớn, cạnh bảng Nhiệm vụ/Đề bài, Cẩm nang và Refs.
4. Ngăn Working tree → Staging area → HEAD.
5. Terminal với lịch sử, hoàn tác/làm lại, nút chạy và thư viện lệnh.

Cẩm nang lấy primer, cheatsheet, pitfalls, proTips và takeaways từ nội dung bài.
Thư viện lệnh lấy cú pháp và mô tả trực tiếp từ GIT_COMMANDS, lọc theo
allowedCommands. Chọn một lệnh chỉ điền tên, người chơi bổ sung tham số trước khi chạy.

## Phủ các luồng

- Chiến dịch và màn hoàn thành.
- Sandbox: cùng bản đồ, terminal, inspector và luồng file.
- Builder, nhập/xuất và panel lưu bài tập: cùng theme.
- OJ: dùng GitLevelScreen, gồm đề Markdown, testcase, gợi ý, nộp và kết quả.
- Màn đang tải/lỗi OJ: GitStatusScreen.
- Trang chi tiết bài Git, gợi ý và lịch sử lượt nộp: cùng Git Odyssey.
- Các game khác không nhận stylesheet nếu không ở trong lớp git-odyssey.

## Nguyên tắc OJ

Có testcase nghĩa là được phép nộp, không có nghĩa là chấm được ở client.
Mọi OJ đều hiển thị trạng thái chấm trên máy chủ. Không vẽ tiến độ cục bộ giả.
Nút nộp khóa xuyên suốt quá trình chấm, lưu lượt nộp và cập nhật dữ liệu.
Kết quả ghi rõ là của lượt nộp gần nhất.

## Phạm vi xác minh

Theo yêu cầu người dùng: không chạy test, smoke test, build hoặc trình duyệt
để kiểm thử. Chỉ đọc mã, triển khai và định dạng các tệp thay đổi.

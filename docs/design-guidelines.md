# Quy tắc thiết kế hiện hành

<!-- updated 260913 -->

Cập nhật 2026-09-13. Nguồn giá trị màu là [globals.css](../apps/web/src/app/globals.css); nguồn đo tương phản là [token contract tests](../packages/ui/src/theme/tokens.contract.test.ts). [Hệ thiết kế](design-system.md) mô tả component và cơ chế theme.

## Landing

Landing giới thiệu việc học DevOps bằng thực hành cụ thể. Bố cục gồm tiêu đề lớn, bàn thực hành trải ngang, dải số lượng nội dung đã xuất bản, danh sách bốn lộ trình, phần giải thích cách học và hành động bắt đầu.

- Không vòng trang trí, ellipse, cảnh 3D hay lưới thẻ trên landing. Đây là yêu cầu trực tiếp của người dùng, thay thế hướng mỹ thuật cũ của P16.
- Bàn thực hành là vùng ứng dụng có khung. Linux, Docker, Kubernetes là bộ chọn ví dụ có tương tác. Nội dung ghi rõ đây là minh hoạ; kết quả mẫu không được diễn đạt như sandbox đang kết nối.
- Chạy ví dụ hiển thị kết quả và giải thích; đặt lại hoặc đổi công nghệ xoá kết quả cũ. Dùng button thật, trạng thái aria-pressed, vùng kết quả aria-live và focus thấy rõ.
- Các đường dẫn lộ trình phải khớp content/paths. Guest CTA mở đăng ký; người đã đăng nhập vào bài học. Ghi rõ cổng đăng nhập khi giới thiệu lộ trình.
- Số lượng nội dung phải đọc từ nguồn đã xuất bản. Không tự tạo số người học, trạng thái hoạt động hay thành tích.
- OpenGraph đồng bộ với hướng terminal và typography. Cảnh K8s Arena và primitive tiến độ dùng chung có phạm vi riêng, không kéo motif của chúng trở lại landing.

## Chữ, màu và bố cục

Mỗi trang có tiêu đề h1 và các khối tiếp theo dùng h2/h3 theo quan hệ nội dung. CardTitle và AlertTitle nhận prop `as` để chọn thẻ h1..h6 mà không đổi hình thức; mặc định h3/h5 được giữ để tương thích. Không dùng cấp heading như một cách chọn cỡ chữ. Cổng axe bắt cả `heading-order` và `page-has-heading-one` dù axe xếp chúng mức moderate.

Control được làm mờ bằng opacity vẫn có thể nhận Tab. Vỏ SearchTabs đồng bộ `inert` và `aria-hidden` với trạng thái mở, đồng thời trả focus về nút mở khi đóng; không dùng màu focus để chữa một nút vốn đang ẩn. Thanh tab dài trên các trang tác giả được phép xuống dòng và giữ vùng bấm 44 px.

Giữ Be Vietnam Pro với bộ ký tự Vietnamese và Latin, cùng system monospace cho lệnh. Không thêm font chỉ để trang trí. Tất cả chữ giao diện, nhãn accessibility và ví dụ terminal đi qua packages/copy.

Màu giao diện dùng semantic tokens; không khai raw color trong component. Primary tối hiện là `oklch(0.68 0.19 26.7)`. Dùng primary-foreground cho chữ trên nút; trắng tinh không đủ tỷ lệ 4.5:1 trên primary tối. Primary và destructive cùng họ đỏ nên phân biệt bằng nền đặc/rỗng, viền và icon.

Thiết kế bắt đầu từ 320 px, kiểm tra tối thiểu 390 px, 768 px và desktop. Nội dung phải tự co và xuống dòng; code không làm tràn cả trang. Touch target tối thiểu 44×44 px. Heading dùng rem-aware clamp; body có line-height đủ đọc dấu tiếng Việt. Focus có offset trên bề mặt primary.

Không tự chạy hiệu ứng. Chuyển động cần có mục đích và tuân thủ prefers-reduced-motion. Không nới CSP để chữa thư viện hoặc hiệu ứng.

## Bản đồ chữ

CopyRef thuộc packages/copy/src/t.ts, giữ quan hệ giữa key và params bằng union phân biệt. Khoá tĩnh không nhận params; khoá động phải có đủ tham số đúng kiểu. renderCopy là điểm dựng chuỗi từ tham chiếu. Không khai bản sao CopyRef ở app.

PROBLEM_TOPIC_LABELS và PROBLEM_DIFFICULTY_LABELS trong packages/games giữ API tương thích, nhưng giá trị lấy từ problem.topic.* và problem.difficulty.* trong packages/copy/src/surfaces/problem.ts. Domain union vẫn thuộc games; câu hiển thị thuộc copy.

## Bằng chứng nghiệm thu

Kết quả kiểm thử và trạng thái hoàn thành được ghi tại [báo cáo runtime P16](../reports/p16-2026-09-12-runtime.md) và [kế hoạch P16](../plans/devops-learning-platform/phase-16.md). Hướng dẫn này mô tả quy tắc thiết kế, không lưu bản sao kết quả từng lượt chạy.

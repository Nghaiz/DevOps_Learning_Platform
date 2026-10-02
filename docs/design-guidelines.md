# Quy tắc thiết kế hiện hành

<!-- updated 261003 -->

Cập nhật 2026-09-13. Nguồn giá trị màu là [globals.css](../apps/web/src/app/globals.css); nguồn đo tương phản là [token contract tests](../packages/ui/src/theme/tokens.contract.test.ts). [Hệ thiết kế](design-system.md) mô tả component và cơ chế theme.

## Landing

<!-- updated 261003 -->

Yêu cầu mới ngày 2026-09-13 thay thế quyết định bỏ toàn bộ 3D và bố cục ghim cảnh trước đó: landing kể hành trình DevOps bằng mô hình 3D nhiều màu xuyên suốt trang, chuyển cảnh theo vị trí cuộn và sự kiện do người dùng kích hoạt. Hợp đồng hiện hành nằm trong phần cập nhật đầu [kế hoạch landing 3D](../plans/reports/2026-09-13-landing-3d-scroll.md); kết quả nghiệm thu được ghi riêng tại báo cáo runtime.

- Bốn chương nằm trong luồng DOM tự nhiên: máy trạm và lệnh, container, cụm máy chủ, phục hồi. Mô hình lớn đổi vị trí trái/phải theo từng chương và tiếp tục chuyển động qua năm điểm neo ở bàn thực hành, danh mục, lộ trình, cách học và CTA cuối trang. Không ghim nội dung bằng sticky/pinned, tráo chương ẩn trong một sân khấu cố định, dùng vòng trắng vô nghĩa hay bố cục lưới thẻ.
- Một canvas trong suốt cố định theo viewport phục vụ toàn trang; camera dùng `viewOffset` để đưa hình tới vị trí điểm neo đang cuộn trong tài liệu. Canvas cố định là lớp render, không giữ nội dung tại chỗ. Hình khối, màu, tỷ lệ và chuyển động phải giải thích phần nội dung đang xuất hiện, không che chữ hay điều khiển.
- Dùng cuộn tự nhiên của trình duyệt và React Three Fiber với `frameloop="demand"`; không thêm GSAP, Lenis hay Locomotive Scroll. Cuộn xuôi và ngược đều cập nhật mô hình theo vị trí tài liệu; cuộn gọi invalidation để cập nhật đích, camera và mô hình chỉ nội suy đến đích rồi ngừng render. Cảnh ngoài màn hình hoặc tab ẩn phải nghỉ. Không chiếm thao tác cuộn hay giữ vòng animation vô hạn.
- Tương tác con trỏ có biên độ giới hạn, chỉ áp dụng với con trỏ chính xác; không cản thao tác vuốt. Nút gây lỗi và phục hồi điều khiển mô phỏng có nhãn rõ ràng, không ngụ ý đang tác động lên sandbox thật.
- Bảng màu riêng `--journey-*` được khai bằng RGB tại `:root` trong [globals.css](../apps/web/src/app/globals.css), chỉ dùng cho cảnh và vùng kể chuyện. Material đọc các token này; không chép màu vào component hoặc truyền chuỗi OKLCH trực tiếp vào Three.js. Shell và các control chung tiếp tục dùng semantic tokens hiện hành.
- Heading, mô tả từng bước, trạng thái và điều khiển phải có HTML ngữ nghĩa; canvas chỉ minh hoạ và không nhận Tab. Có điều hướng từng bước, focus rõ và đường bỏ qua đến lộ trình. Chỉ thông báo sự kiện rời rạc do người dùng kích hoạt, không đọc tiến độ ở mỗi khung hình.
- Với `prefers-reduced-motion`, dùng minh hoạ HTML/CSS tĩnh, không mount canvas hay chạy GPU; bỏ parallax và cuộn mượt lập trình. Khi WebGL không hỗ trợ, mất context hoặc tải cảnh thất bại, cũng giữ minh hoạ tĩnh cùng nội dung, điều khiển và CTA; không để vùng đầu trang trống hoặc tải mãi.
- Bàn thực hành là vùng ứng dụng có khung. Linux, Docker, Kubernetes là bộ chọn ví dụ có tương tác. Nội dung ghi rõ đây là minh hoạ; kết quả mẫu không được diễn đạt như sandbox đang kết nối.
- Bàn thực hành có màu và tiến trình hình ảnh theo cuộn. Các hiệu ứng này không chạy lệnh, đổi công nghệ đang chọn hoặc tự tạo kết quả; chỉ thao tác Chạy ví dụ mới hiển thị đầu ra mô phỏng.
- Chạy ví dụ hiển thị kết quả và giải thích; đặt lại hoặc đổi công nghệ xoá kết quả cũ. Dùng button thật, trạng thái aria-pressed, vùng kết quả aria-live và focus thấy rõ.
- Các đường dẫn lộ trình phải khớp content/paths. Guest CTA mở đăng ký; người đã đăng nhập vào bài học. Ghi rõ cổng đăng nhập khi giới thiệu lộ trình.
- Số lượng nội dung phải đọc từ nguồn đã xuất bản. Không tự tạo số người học, trạng thái hoạt động hay thành tích.
- Bàn thực hành, danh mục thật, lộ trình và CTA tiếp tục nằm trong luồng nội dung tự nhiên, với điểm neo cho cảnh 3D xuyên suốt trang. OpenGraph đồng bộ với câu chuyện học và triển khai ứng dụng. Cảnh K8s Arena và primitive tiến độ dùng chung giữ phạm vi riêng; không đưa trạng thái gameplay vào landing.

## Chữ, màu và bố cục

Bản dựng lại PTIT (2026-10-03) theo [design brief](../plans/fe-ptit-rebuild/design-brief.md): ngôn ngữ "bảng tuyến", mỗi chủ đề là một tuyến tàu có màu riêng, header trên cùng thay cho thanh bên. Tên class và API component chốt ở [ui-kit](../plans/fe-ptit-rebuild/contracts/ui-kit.md).

Bốn luật chủ dự án chốt: không thẻ bo góc (bo góc bằng 0 ở mọi bề mặt), không thanh điều hướng bên trái, không dùng viền trái làm dấu "đang mở", không hàng ô số liệu ở trang tổng quan. Số liệu nằm trong câu (`Num`), trong bảng, hoặc trên thước đo (`Meter`).

Ba họ chữ, mỗi họ một vai: Archivo cho tiêu đề kiểu biển ga (kéo rộng bằng `font-stretch`), Be Vietnam Pro cho chữ đọc, JetBrains Mono cho lệnh và nhãn in hoa. Cả ba có bộ ký tự Vietnamese và tự host qua next/font. Dấu tiếng Việt chồng tầng nên line-height của tiêu đề không dưới 1.02. Tất cả chữ giao diện đi qua packages/copy.

Màu dùng semantic tokens, không khai màu cứng trong component. `primary` (đỏ PTIT) chỉ làm nền đặc: nút chính, khối section đang mở. Đỏ làm chữ là `brand`. `signal` (vàng sao PTIT) chỉ làm nền dưới chữ ink. Màu chủ đề lấy qua `lineForTopic` và token `line-*`. Độ khó không dùng màu sắc mà dùng thanh bốn vạch, để màu chỉ mang nghĩa "chủ đề".

Mỗi trang có đúng một h1 (PosterHeader hoặc ToolHeader render nó), các khối tiếp theo dùng h2/h3 theo quan hệ nội dung. Có đúng một `<main>`, ở app-shell. Focus luôn hiện vòng `ring` xanh. Cổng axe bắt cả `heading-order` và `page-has-heading-one`.

Kiểm tra ở 375, 768, 1024 và 1440 px, không cuộn ngang ở 375 px. Mọi danh sách có đủ trạng thái đang tải (khung chờ hình dòng thật), rỗng, lỗi và một trang.

Chuyển động phục vụ thao tác: rê vào dòng thì màu tuyến quét từ trái sang, menu mở bằng clip-path, danh sách vào trang lần lượt. Tất cả tắt khi bật prefers-reduced-motion. Không nới CSP hoặc ngân sách bundle để đổi lấy hiệu ứng.

Game K8s (`components/k8s-arena`) giữ nguyên hình theo yêu cầu của chủ dự án: khối `.arena-root.dark` cuối globals.css đóng băng token của nó.

## Bản đồ chữ

CopyRef thuộc packages/copy/src/t.ts, giữ quan hệ giữa key và params bằng union phân biệt. Khoá tĩnh không nhận params; khoá động phải có đủ tham số đúng kiểu. renderCopy là điểm dựng chuỗi từ tham chiếu. Không khai bản sao CopyRef ở app.

PROBLEM_TOPIC_LABELS và PROBLEM_DIFFICULTY_LABELS trong packages/games giữ API tương thích, nhưng giá trị lấy từ problem.topic.* và problem.difficulty.* trong packages/copy/src/surfaces/problem.ts. Domain union vẫn thuộc games; câu hiển thị thuộc copy.

## Bằng chứng nghiệm thu

Kết quả landing hiện hành được ghi tại [báo cáo runtime 3D](../reports/2026-09-13-landing-3d-runtime.md). [Báo cáo runtime P16](../reports/p16-2026-09-12-runtime.md) và [kế hoạch P16](../plans/devops-learning-platform/phase-16.md) giữ bằng chứng của đợt trước. Hướng dẫn này mô tả quy tắc thiết kế, không lưu bản sao kết quả từng lượt chạy hoặc suy ra độ mượt trên mọi thiết bị từ một phép đo.

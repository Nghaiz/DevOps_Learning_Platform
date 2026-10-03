# Quy tắc thiết kế hiện hành

<!-- updated 260913 -->

Cập nhật 2026-09-13. Nguồn giá trị màu là [globals.css](../apps/web/src/app/globals.css); nguồn đo tương phản là [token contract tests](../packages/ui/src/theme/tokens.contract.test.ts). [Hệ thiết kế](design-system.md) mô tả component và cơ chế theme.

## Landing

<!-- updated 261003 -->

Cập nhật 2026-10-03, thay toàn bộ quyết định ngày 2026-09-13. Chủ dự án yêu cầu tường minh một landing 3D cuộn-điều-khiển dùng GSAP, Lenis và React Three Fiber, có ghim cảnh và motion graphics; các lệnh cấm cũ ("không GSAP/Lenis", "không ghim", "chỉ `frameloop=demand`") đã bị gỡ. Kế hoạch và hợp đồng: [landing-3d/plan.md](../plans/devops-learning-platform/landing-3d/plan.md). Mã: `apps/web/src/components/landing/**`.

- Câu chuyện là một tuyến metro: tuyến đỏ PTIT chạy qua sáu ga (Linux, Git, Docker, Kubernetes, CI/CD, production), mỗi ga một model 3D dựng thủ tục và một sự kiện tua theo cuộn; cuộn ngược thì sự kiện chạy ngược. Sau đó là terminal tua theo cuộn, bốn cửa vào học, lộ trình thật từ DB, phòng game, vòng lặp ∞ ở phần kết.
- Một vòng lặp duy nhất: `gsap.ticker`. Lenis chạy `autoRaf: false` và được ticker bơm; canvas R3F chạy `frameloop="never"` và được ticker gọi `advance()`. Canvas ngừng vẽ khi khu "đặc" (cách học, lộ trình, trò chơi) che nó hoặc tab bị ẩn.
- Ghim bằng ScrollTrigger: hành trình 7 màn, terminal 3,2 màn, lộ trình cuộn ngang trên desktop. Nhịp của đoạn hành trình là một hàm thuần dùng chung cho DOM và 3D (`journey-timeline.ts`), để chữ và camera không lệch nhau.
- Motion graphics là lớp 2D chạy cùng 3D: kinetic type (ký tự trồi lên lúc tải; trục `wdth` của Archivo đặt tĩnh theo từng khu, KHÔNG scrub theo cuộn vì mỗi giá trị wdth là một instance font mới: layout + tô lại cả tiêu đề mỗi khung), bảng lật Solari, ScrambleText, icon MorphSVG, tuyến DrawSVG + MotionPath, dải chữ theo vận tốc cuộn, số đếm kiểu đồng hồ cơ, nút từ tính.
- Ngôn ngữ hình ảnh khớp app: góc vuông, đường kẻ 1px, đỏ PTIT cho CTA, mỗi chủ đề một màu tuyến (cùng giá trị với token `--line-*`). Khi màu tuyến làm CHỮ trên nền tối thì dùng bản pha sáng (`--line-ink`), vì docker và k8s gốc chỉ khoảng 3:1. Landing luôn tối, không theo theme.
- Màu cảnh 3D đọc từ chính biến `--l-*` của landing lúc mount; không khai màu lần thứ hai trong mã cảnh. Bộ tối ưu CSS lúc build đổi `rgb()` thành hex, nên bộ đọc phải nhận cả hai. Nhãn chữ trong cảnh vẽ bằng CanvasTexture, suy từ chính chuỗi trong `packages/copy`.
- CSP không nới: không troika (`<Text>` của drei), không HDR/Draco/KTX2 từ CDN, không blob worker, không WASM. Model dựng thủ tục, ánh sáng môi trường bằng Lightformer tại chỗ.
- Hiệu năng: three/R3F/postprocessing chỉ vào trang qua `next/dynamic` (không lọt nền chung hay `/login`); ba tầng chất lượng, renderer phần mềm (SwiftShader, llvmpipe) xuống thẳng tầng thấp không hậu kỳ; `PerformanceMonitor` hạ tầng khi khung tụt.
- Giảm chuyển động: không mount canvas, không Lenis, không ghim, không scramble; KHÔNG có vòng lặp nào chạy. Bản đồ tuyến SVG tĩnh thay cảnh 3D. Không WebGL, mất context, hoặc chunk cảnh lỗi cũng rơi về hình tĩnh với đủ nội dung.
- HTML ngữ nghĩa cho mọi chữ; canvas `aria-hidden`. Chữ tách ký tự và chữ xáo có bản `sr-only` nguyên câu. Số liệu chỉ đọc từ nguồn đã xuất bản; đọc lỗi thì hiện "?" chứ không bao giờ hiện 0. Cảnh 3D và terminal ghi rõ là mô phỏng.

## Chữ, màu và bố cục

Mỗi trang có tiêu đề h1 và các khối tiếp theo dùng h2/h3 theo quan hệ nội dung. CardTitle và AlertTitle nhận prop `as` để chọn thẻ h1..h6 mà không đổi hình thức; mặc định h3/h5 được giữ để tương thích. Không dùng cấp heading như một cách chọn cỡ chữ. Cổng axe bắt cả `heading-order` và `page-has-heading-one` dù axe xếp chúng mức moderate.

Control được làm mờ bằng opacity vẫn có thể nhận Tab. Vỏ SearchTabs đồng bộ `inert` và `aria-hidden` với trạng thái mở, đồng thời trả focus về nút mở khi đóng; không dùng màu focus để chữa một nút vốn đang ẩn. Thanh tab dài trên các trang tác giả được phép xuống dòng và giữ vùng bấm 44 px.

Giữ Be Vietnam Pro với bộ ký tự Vietnamese và Latin, cùng system monospace cho lệnh. Không thêm font chỉ để trang trí. Tất cả chữ giao diện, nhãn accessibility và ví dụ terminal đi qua packages/copy.

Màu giao diện dùng semantic tokens; không khai raw color trong component. Primary tối hiện là `oklch(0.68 0.19 26.7)`. Dùng primary-foreground cho chữ trên nút; trắng tinh không đủ tỷ lệ 4.5:1 trên primary tối. Primary và destructive cùng họ đỏ nên phân biệt bằng nền đặc/rỗng, viền và icon.

Thiết kế bắt đầu từ 320 px, kiểm tra tối thiểu 390 px, 768 px và desktop. Nội dung phải tự co và xuống dòng; code không làm tràn cả trang. Touch target tối thiểu 44×44 px. Heading dùng rem-aware clamp; body có line-height đủ đọc dấu tiếng Việt. Focus có offset trên bề mặt primary.

Chuyển động cần có mục đích, gắn với cuộn hoặc thao tác và tuân thủ prefers-reduced-motion. Không nới CSP hoặc giới hạn bundle để chữa thư viện hay hiệu ứng. Độ mượt và chất lượng mô hình phải được kiểm tra trên cảnh WebGL thực tế; kết quả DOM không thay thế bằng chứng hình ảnh và phép đo khung hình.

## Bản đồ chữ

CopyRef thuộc packages/copy/src/t.ts, giữ quan hệ giữa key và params bằng union phân biệt. Khoá tĩnh không nhận params; khoá động phải có đủ tham số đúng kiểu. renderCopy là điểm dựng chuỗi từ tham chiếu. Không khai bản sao CopyRef ở app.

PROBLEM_TOPIC_LABELS và PROBLEM_DIFFICULTY_LABELS trong packages/games giữ API tương thích, nhưng giá trị lấy từ problem.topic.* và problem.difficulty.* trong packages/copy/src/surfaces/problem.ts. Domain union vẫn thuộc games; câu hiển thị thuộc copy.

## Bằng chứng nghiệm thu

Kết quả landing hiện hành được ghi tại [báo cáo runtime 3D](../reports/2026-09-13-landing-3d-runtime.md). [Báo cáo runtime P16](../reports/p16-2026-09-12-runtime.md) và [kế hoạch P16](../plans/devops-learning-platform/phase-16.md) giữ bằng chứng của đợt trước. Hướng dẫn này mô tả quy tắc thiết kế, không lưu bản sao kết quả từng lượt chạy hoặc suy ra độ mượt trên mọi thiết bị từ một phép đo.

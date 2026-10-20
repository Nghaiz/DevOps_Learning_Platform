# Quy tắc thiết kế hiện hành

<!-- updated 261003 -->

Cập nhật 2026-10-20. Nguồn giá trị màu là [theme.css của ds](../packages/ds/src/styles/theme.css), sinh từ `packages/ds/scripts/palette.mjs`; nguồn đo tương phản là [palette.test.ts](../packages/ds/src/styles/palette.test.ts). [Hệ thiết kế](design-system.md) mô tả token, component và cổng. Giao diện cũ của các vùng giữ nguyên có tài liệu riêng ở [design-system-legacy.md](design-system-legacy.md).

## Landing

<!-- updated 261003 -->

Cập nhật 2026-10-03, thay toàn bộ quyết định ngày 2026-09-13. Chủ dự án yêu cầu tường minh một landing 3D cuộn-điều-khiển dùng GSAP, Lenis và React Three Fiber, có ghim cảnh và motion graphics; các lệnh cấm cũ ("không GSAP/Lenis", "không ghim", "chỉ `frameloop=demand`") đã bị gỡ. Kế hoạch và hợp đồng: [landing-3d/plan.md](../plans/devops-learning-platform/landing-3d/plan.md). Mã: `apps/web/src/components/landing/**`.

- Câu chuyện là một tuyến metro: tuyến đỏ PTIT chạy qua sáu ga (Linux, Git, Docker, Kubernetes, CI/CD, production), mỗi ga một model 3D dựng thủ tục và một sự kiện tua theo cuộn; cuộn ngược thì sự kiện chạy ngược. Sau đó là terminal tua theo cuộn, bốn cửa vào học, lộ trình thật từ DB, phòng game, vòng lặp ∞ ở phần kết.
- Một vòng lặp duy nhất: `gsap.ticker`. Lenis chạy `autoRaf: false` và được ticker bơm; canvas R3F chạy `frameloop="never"` và được ticker gọi `advance()`. Canvas ngừng vẽ khi khu "đặc" (cách học, lộ trình, trò chơi) che nó hoặc tab bị ẩn.
- Ghim bằng ScrollTrigger: hành trình 7 màn, terminal 3,2 màn, lộ trình cuộn ngang trên desktop. Nhịp của đoạn hành trình là một hàm thuần dùng chung cho DOM và 3D (`journey-timeline.ts`), để chữ và camera không lệch nhau.
- Motion graphics là lớp 2D chạy cùng 3D: kinetic type (ký tự trồi lên lúc tải; trục `wdth` của Archivo đặt tĩnh theo từng khu, KHÔNG scrub theo cuộn vì mỗi giá trị wdth là một instance font mới: layout + tô lại cả tiêu đề mỗi khung), bảng lật Solari, ScrambleText, icon MorphSVG, tuyến DrawSVG + MotionPath, dải chữ theo vận tốc cuộn, số đếm kiểu đồng hồ cơ, nút từ tính.
- Ngôn ngữ hình ảnh của landing (giữ nguyên theo yêu cầu, không theo hệ `ds` của app): góc vuông, đường kẻ 1px, đỏ PTIT cho CTA, mỗi chủ đề một màu tuyến (cùng giá trị với token `--line-*`). Khi màu tuyến làm CHỮ trên nền tối thì dùng bản pha sáng (`--line-ink`), vì docker và k8s gốc chỉ khoảng 3:1. Landing luôn tối, không theo theme.
- Màu cảnh 3D đọc từ chính biến `--l-*` của landing lúc mount; không khai màu lần thứ hai trong mã cảnh. Bộ tối ưu CSS lúc build đổi `rgb()` thành hex, nên bộ đọc phải nhận cả hai. Nhãn chữ trong cảnh vẽ bằng CanvasTexture, suy từ chính chuỗi trong `packages/copy`.
- CSP không nới: không troika (`<Text>` của drei), không HDR/Draco/KTX2 từ CDN, không blob worker, không WASM. Model dựng thủ tục, ánh sáng môi trường bằng Lightformer tại chỗ.
- Hiệu năng: three/R3F/postprocessing chỉ vào trang qua `next/dynamic` (không lọt nền chung hay `/login`); ba tầng chất lượng, renderer phần mềm (SwiftShader, llvmpipe) xuống thẳng tầng thấp không hậu kỳ; `PerformanceMonitor` hạ tầng khi khung tụt.
- Giảm chuyển động: không mount canvas, không Lenis, không ghim, không scramble; KHÔNG có vòng lặp nào chạy. Bản đồ tuyến SVG tĩnh thay cảnh 3D. Không WebGL, mất context, hoặc chunk cảnh lỗi cũng rơi về hình tĩnh với đủ nội dung.
- HTML ngữ nghĩa cho mọi chữ; canvas `aria-hidden`. Chữ tách ký tự và chữ xáo có bản `sr-only` nguyên câu. Số liệu chỉ đọc từ nguồn đã xuất bản; đọc lỗi thì hiện "?" chứ không bao giờ hiện 0. Cảnh 3D và terminal ghi rõ là mô phỏng.

## Chữ, màu và bố cục

<!-- updated 261020 -->

Bản dựng lại 2026-10 thay toàn bộ ngôn ngữ "bảng tuyến" của bản PTIT trước đó. Hệ hiện hành là `ds`; token, component và cổng ở [design-system.md](design-system.md).

- Điều hướng là thanh trên cùng với sáu mục cha (Học, Thực hành, Luyện đề, Trò chơi, Soạn bài, Quản trị) và thanh mục con ngay dưới. Không có thanh bên trái, kể cả ở trang quản trị và trang soạn.
- Không thẻ bo góc xếp lưới, không hàng ô số liệu, không viền trái làm dấu đang chọn, không loader quay vòng, không bộ icon đại trà. Số liệu nằm trong câu, trong bảng hoặc trên `ProgressLine`. `pnpm design:check` gác các lệnh cấm có hình dạng xác định trong mã.
- Màu theo hai trục: màu mục (`data-section`) cho vỏ và điểm nhấn, màu chủ đề (`data-topic`) cho nội dung. Trạng thái dùng ok, warn, bad, info và luôn kèm chữ hoặc biểu tượng. Độ khó dùng `LevelBars`, không dùng màu.
- Ba họ chữ: Bricolage Grotesque cho tiêu đề, Hanken Grotesk cho chữ giao diện và chữ đọc, Intel One Mono cho lệnh và mã. Tự host qua next/font, có subset Vietnamese. Mọi chữ giao diện đi qua packages/copy.
- Mỗi trang có đúng một h1 (`PageHeader`) và một `<main>` ở app-shell. Focus luôn hiện vòng `focus`. Cổng axe bắt cả `heading-order` và `page-has-heading-one`.
- Kiểm ở 390, 768, 1024 và 1440 px, không cuộn ngang ở 390 px. Mọi danh sách có đủ trạng thái đang tải (khung chờ đúng hình dòng), rỗng, lỗi và phân trang.
- Chuyển động phục vụ thao tác: khối vào trang lần lượt, popover nở từ chỗ bấm, vạch quét khi đang tải. Tất cả tắt khi bật prefers-reduced-motion. Không nới CSP hoặc ngân sách bundle để đổi lấy hiệu ứng.
- Canvas game K8s, màn chơi Git và CI/CD giữ giao diện cũ theo yêu cầu của chủ dự án (`legacy.css`, `LegacySkin`); trang chọn màn của các game là giao diện mới. Bảng bên của sandbox Git, nơi có Level Builder, là một khối giao diện mới bên trong màn chơi cũ (`.ds-island`, xem design-system.md mục 9).

## Bản đồ chữ

CopyRef thuộc packages/copy/src/t.ts, giữ quan hệ giữa key và params bằng union phân biệt. Khoá tĩnh không nhận params; khoá động phải có đủ tham số đúng kiểu. renderCopy là điểm dựng chuỗi từ tham chiếu. Không khai bản sao CopyRef ở app.

PROBLEM_TOPIC_LABELS và PROBLEM_DIFFICULTY_LABELS trong packages/games giữ API tương thích, nhưng giá trị lấy từ problem.topic.* và problem.difficulty.* trong packages/copy/src/surfaces/problem.ts. Domain union vẫn thuộc games; câu hiển thị thuộc copy.

## Bằng chứng nghiệm thu

Kết quả landing hiện hành được ghi tại [báo cáo runtime 3D](../reports/2026-09-13-landing-3d-runtime.md). [Báo cáo runtime P16](../reports/p16-2026-09-12-runtime.md) và [kế hoạch P16](../plans/devops-learning-platform/phase-16.md) giữ bằng chứng của đợt trước. Hướng dẫn này mô tả quy tắc thiết kế, không lưu bản sao kết quả từng lượt chạy hoặc suy ra độ mượt trên mọi thiết bị từ một phép đo.

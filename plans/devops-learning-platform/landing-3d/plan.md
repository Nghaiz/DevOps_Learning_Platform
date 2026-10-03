# Landing 3D (2026-10-03) — kế hoạch và hợp đồng

Thay thế quyết định landing ngày 2026-09-13 (`plans/reports/2026-09-13-landing-3d-scroll.md`)
và mục "## Landing" cũ của `docs/design-guidelines.md`. Lý do: chủ dự án yêu cầu tường minh
ngày 2026-10-03 một landing 3D cuộn-điều-khiển dùng GSAP + Lenis + R3F, có ghim cảnh, terminal
nhiều màu với text-scramble, nhiều model DevOps. Quyết định cũ ("không GSAP/Lenis, không ghim")
bị gỡ; các ràng buộc còn đúng được GIỮ: không nới CSP, không nâng trần bundle, giảm chuyển động
thì không chạy GPU, số liệu chỉ đọc từ nguồn đã xuất bản, không có phần thương mại.

Nhánh `feat/landing-3d`, worktree riêng. Phiên song song: 00 làm lại toàn bộ FE (vỏ app,
packages/ui), 0c làm nội dung bài và `server/**`. Ranh giới đã chốt qua tin nhắn: landing chỉ
sở hữu `app/page.tsx`, `components/landing/**`, `e2e/landing*`, khoá `home.*`, dep gsap + lenis.

## Hợp đồng với vỏ app (00)

- `pathname === '/'`: vỏ chỉ render provider + một `<main>` trần (không sidebar, topbar,
  padding, nền). Landing tự vẽ thanh trên và chân trang.
- `useViewer(): Viewer | null` từ `components/shell/viewer-context`.
- Ngôn ngữ hình ảnh chung: đỏ PTIT, góc vuông (radius 0), đường kẻ 1px thay khung, mỗi chủ đề
  một màu "tuyến metro", font Archivo (display) + JetBrains Mono (nhãn) + Be Vietnam Pro (thân).

## Kịch bản cuộn

| # | Khu | Canvas | Sự kiện chính |
|---|---|---|---|
| 0 | Thanh trên cố định | — | trong suốt → mờ tối khi cuộn; vạch tiến độ đỏ toàn trang |
| 1 | Hero | chòm tuyến metro 3D | chữ lộ từng ký tự, parallax theo chuột, đếm số thật, nút từ tính |
| 2 | Hành trình (ghim, 6 ga) | camera bay dọc tuyến đỏ | mỗi ga một model + một sự kiện tua theo cuộn, đoàn tàu "commit" dẫn đường |
| 3 | Terminal (ghim) | giá máy sandbox | lệnh gõ theo cuộn, trạng thái pod scramble Pending → Running, pod 3D sáng theo |
| 4 | Bốn kiểu bài | ẩn | thẻ góc vuông, tô màu tuyến khi hover, đèn theo con trỏ |
| 5 | Dải chữ chạy | ẩn | tốc độ và độ nghiêng theo vận tốc cuộn |
| 6 | Lộ trình (ghim ngang) | ẩn | lộ trình thật từ DB, mỗi lộ trình là một tuyến có số ga |
| 7 | Trò chơi | ẩn | game thật từ `games-catalog`, nghiêng 3D theo chuột |
| 8 | Kết | vòng ∞ hạt nhiều màu | số liệu đếm lên, CTA cuối |
| 9 | Chân trang | — | — |

Sáu ga: Linux (máy chủ + cột htop), Git (đồ thị nhánh gộp), Docker (layer xếp thành
container), Kubernetes (bánh lái + 3 node, pod sinh/chết/tự dựng lại), CI/CD (4 cổng đổi
xanh, một cổng đỏ rồi chạy lại), Production (địa cầu điểm + cung lưu lượng + cột metric).

## Kiến trúc

- `app/page.tsx` (server): metadata qua `t()`, đọc số liệu + lộ trình, render `<Landing>`.
- `components/landing/data/*.server.ts`: đếm bài/lab/playground/quiz/lộ trình qua nguồn đã
  xuất bản; mỗi loại lỗi riêng thì trả `null`, không bao giờ bịa 0.
- `components/landing/motion/*`: MỘT vòng lặp duy nhất là `gsap.ticker`; Lenis chạy trong nó,
  R3F chạy `frameloop="never"` + `advance()` trong nó khi canvas đang hiện. Giảm chuyển động:
  không Lenis, không ghim, không canvas, không scramble.
- `components/landing/stage/*`: toàn bộ three/R3F/postprocessing, CHỈ vào qua `next/dynamic`
  (`ssr:false`) nên không lọt nền chung hay `/login`. Model dựng thủ tục (CSP chặn HDR CDN,
  Draco/WASM, troika, blob). Nhãn 3D vẽ bằng CanvasTexture.
- Kho trạng thái cuộn là object module (không phải React state); ScrollTrigger ghi, `useFrame`
  đọc. Không re-render theo khung hình.
- Màu: không hex ở bất kỳ đâu dưới `apps/web/src` (cổng `tokens:check`). CSS module khai biến
  `rgb()`, cảnh 3D đọc biến đó lúc mount.

## Mã nhận diện cho e2e

`landing-root[data-motion=full|reduced][data-scene-state=idle|loading|ready|fallback]`,
`landing-hero`, `landing-journey[data-station=0..5]`, `journey-station-<id>`,
`landing-terminal[data-step=0..4]`, `landing-modes`, `landing-paths`, `landing-games`,
`landing-closing`, `landing-cta-primary`.

## Tiêu chí nghiệm thu

1. `/` là landing mới; không còn màn chọn game; không có chrome của vỏ.
2. Lenis + ScrollTrigger: hành trình ghim 6 ga, camera tua theo cuộn cả xuôi lẫn ngược, mỗi ga
   có sự kiện nhìn thấy được; terminal ghim với scramble; lộ trình cuộn ngang; dải chữ theo vận
   tốc; đếm số; nút từ tính; chữ lộ từng ký tự.
3. Ít nhất 10 model thủ tục khác nhau theo chủ đề DevOps.
4. Giảm chuyển động: 0 WebGL context, không Lenis, không ghim; mọi nội dung đọc được.
5. Không WebGL / mất context / chunk cảnh lỗi: rơi về minh hoạ tĩnh, nội dung nguyên vẹn.
6. Cổng: tsc, eslint, vitest, `next build`, `tokens:check`, `bundle:check`, `env-check`,
   `no-commerce`, `e2e:ci` (axe 0 serious, CSP 0 vi phạm, 390px không tràn) đều xanh.
7. GPU thật (`e2e:landing3d`): p95 khoảng khung ≤ 20 ms khi cuộn theo kịch bản; LCP < 2,5 s và
   phần tử LCP không phải canvas.
8. Ảnh chụp từng khu ở 1440 và 390 px, tự nhìn: không vùng trống, chữ đọc được.
9. Copy tiếng Việt viết như người, qua mọi cổng của `packages/copy`.
10. PR gộp vào `main` với CI xanh; triển khai lên cụm; `/` trên cụm được chụp lại để đối chứng.

## Giả định đã chốt (chủ dự án yêu cầu tự chủ, báo một lượt cuối)

- Landing luôn tối, bất kể theme sáng/tối của app.
- Font Archivo + JetBrains Mono nạp tạm trong landing tới khi layout gốc của 00 nạp chung.
- Dockerfile thêm `COPY public` (cụm đang 404 logo + favicon; 0c đồng ý).

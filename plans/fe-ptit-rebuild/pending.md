# Việc còn dở sau bản demo (2026-10-03)

Chủ dự án yêu cầu dừng việc làm thêm để có bản ổn định trên
https://dlp.192.168.94.130.sslip.io:30443/ cho buổi demo. Danh sách dưới đây là mọi thứ chưa làm
hoặc đang làm dở lúc dừng, kèm chỗ bắt đầu lại. Xếp theo mức nên làm trước.

## 1. Kiểm thử thật trên cụm sau khi deploy

- Chạy các kịch bản `@flow` (lab, bài học, sân chơi, admin, soạn bài, lộ trình, trắc nghiệm, bài
  CI/CD) trên cụm. Lane E1 đã chuyển chúng sang giao diện mới nhưng chưa chạy với backend thật.
  - Lab cố định bài `dlp-linux-triage`, bài học cố định `dlp-ide-config-edit`. Cụm phải có hai bài
    này và image sandbox có Theia.
  - Phép kiểm IDE tìm `#theia-app-shell`. Nếu IDE chạy mà phép kiểm đỏ thì xem selector này trước.
  - Đăng nhập qua form bị giới hạn 3 lần mỗi phút.
- Lượt chụp màn hình mọi route ở 1440 và 390, sáng và tối, trên `next start`. Nhớ xem CSS của ô tìm
  kiếm `gooey-search-tabs` ở trang danh mục còn nạp sau khi packages/ui khai `sideEffects: false`
  (commit 5309adb1).
- `e2e:ci` chưa chạy ở máy, mới chỉ dựa vào CI.

## 2. Trang thống kê và thành tựu game (phần UI hoãn từ phase 14)

Đặc tả: `plans/devops-learning-platform/phase-14-exec.md` §8.3, §8.4, §8.6. Chưa có dòng mã nào.
Lane G đã dò xong và gặp hai việc phải quyết trước:

- Barrel `packages/games/src/index.ts` chưa export `computeStats`, `evaluateAchievements`,
  `K8S_ACHIEVEMENTS`, `CROSS_GAME_ACHIEVEMENTS` và các kiểu đi kèm. Cách sửa: thêm một khối
  re-export, không đổi logic.
- Game K8s chỉ lưu `RunResult` khi thắng, không lưu `RunLog` và không đóng checksum. Vì vậy hôm nay
  không lượt nào xác minh được: cột "Đã xác minh" luôn rỗng, mọi thành tựu luôn khoá, và cảnh báo
  "bản lưu bị sửa" không bao giờ bật. Muốn tính năng chạy thật phải cho
  `components/k8s-arena/level-progress.ts` lưu thêm nhật ký lượt chơi. File đó nằm trong phần game
  K8s mà chủ dự án dặn để nguyên, nên **cần chủ dự án cho phép** trước khi sửa.
- Chỉ game K8s ghi lượt chơi vào bản lưu chung. Git và CI/CD giữ bản đồ cột mốc riêng, nên thành
  tựu liên game chưa có dữ liệu.

Worktree `D:/NCKH/dlp-fe-g` (nhánh `feat/fe-game-stats`) đã tạo sẵn, chưa có thay đổi nào.

## 3. Tài liệu

`docs/design-system.md`, `docs/design-guidelines.md` và `docs/frontend-practice-redesign.md` vẫn
tả giao diện cũ (sidebar, practice shell, thẻ bo tròn). Lane T1 đã sửa phần token đã xoá trong
design-system.md. Nguồn để viết lại: `plans/fe-ptit-rebuild/design-brief.md` và
`contracts/ui-kit.md`. Chú thích của `--foreground` trong `globals.css` còn ghi `#373D4E` trong khi
giá trị thật là `oklch(...)`.

## 4. Tính năng và lỗi đã biết

- **Không gắn lại được phiên đang chạy.** Tải lại trang lab, bài học hay sân chơi là mất liên kết với
  phiên; bấm bắt đầu sẽ mở phiên MỚI trong khi phiên cũ vẫn giữ chỗ tới khi hết hạn. Hiện chỉ gắn
  lại được qua `/session/<id>/terminal` (nút "Mở terminal" ở /me). Dữ liệu đã có (`me.activeSessions`
  trả `content`), còn thiếu đường gắn lại trong trình phát.
- **Kỳ thi:** bài nộp không kèm `examId` luôn là luyện tập và được tính theo cửa sổ chấm. Hai kỳ thi
  chồng giờ có cùng một bài thì một lần giải được tính cho cả hai. Ghi bài nộp vào lượt thi (cần
  migration thêm `exam_id`) là việc của phiên 0c.
- **Chế độ chaos** của game K8s nằm trong arena đã đóng băng, chưa nối vào lúc chạy.
- `e2e/games.spec.ts` và `e2e/games-git.spec.ts` đã hỏng từ trước, không nằm trong `e2e:ci`. Cần sửa
  hoặc bỏ có ghi lý do. `games-hub.spec.ts` nên chạy xanh hai lần ở máy.

## 5. Việc của phiên khác, để biết

- 5a (landing): `home.catalog-label.playgrounds` còn ghi "Playground" trong khi mọi chỗ khác đã là
  "Sân chơi". Landing merge riêng.
- 0c: PR #161 (cookie theo phiên, `Session.hard_cap_at`, image sandbox có Theia, hai bài viết lại).

## 6. Dọn máy

Thư mục rỗng `C:\c\Users\...` sinh ra do một lần chụp màn hình sai đường dẫn. Lệnh xoá bị chặn, chủ
máy tự xoá.

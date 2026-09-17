# 19.G — Tiến độ triển khai nội dung chương CD, 2026-09-17

**Trạng thái:** đã viết và gộp đủ 14 level C15–C28; chưa nghiệm thu AC-G.

> **Cập nhật cùng ngày:** AC-G đã nghiệm thu, mâu thuẫn `minGreenRate` đã giải, chương CD đã nối
> vào web — xem [`2026-09-17-p19-g-i-acceptance.md`](2026-09-17-p19-g-i-acceptance.md).
**Phạm vi:** 14 level C15–C28 theo [phase-19-g-lanes.md](../phase-19-g-lanes.md) và
[phase-19.md](../phase-19.md), giữ nguyên hợp đồng engine.

| Lane | Phạm vi sở hữu | Tiến độ |
|---|---|---|
| 1 | `packages/games/src/cicd/levels/cd-som.ts`, các file C15–C21 | Đã gộp đủ 7 level |
| 2 | `packages/games/src/cicd/levels/cd-muon.ts`, các file C22–C28 | Đã gộp đủ 7 level; lead viết nốt C28 sau khi lane bị gián đoạn |

Mỗi level cần hai hướng giải khác nhau, một mục thưởng đạt ở đúng một hướng giải, và trạng
thái ban đầu trượt ít nhất một mục bắt buộc. Đây là yêu cầu thiết kế, chưa phải kết quả đã
được xác nhận trong lượt này. Level nào cần thay đổi hợp đồng engine phải được ghi thành đề
xuất riêng thay vì tự mở rộng hợp đồng.

## Giới hạn bằng chứng

Chủ dự án yêu cầu bắt tay triển khai và không thực hiện pha test, không chạy test, smoke test
hay lệnh xác minh. Số test/smoke đã chạy trong lượt này: **0**. Không tuyên bố AC-G đạt, lời
giải chạy thành công hay chương CD đã được nghiệm thu. Lead cập nhật trạng thái triển khai
cuối cùng sau khi tích hợp hai lane; trạng thái nghiệm thu vẫn phải phản ánh giới hạn này.

## Nội dung đã gộp

| Level | Commit tích hợp | Hai hướng giải / mục thưởng theo thiết kế |
|---|---|---|
| C15 | `3d153ab` | Giao artifact trực tiếp hoặc qua bước kiểm ảnh; thưởng độ trễ |
| C16 | `b78ef7f` | Thăng hạng trực tiếp hoặc thêm cổng API staging; thưởng độ trễ |
| C17 | `e51b7eb` | Duyệt sau staging hoặc duyệt artifact song song; thưởng độ trễ |
| C18 | `bda577e` | Lùi đợt lớn hoặc sửa tiến với đợt nhỏ; thưởng ít máy dư |
| C19 | `3f8b5ae` | Blue-green lùi bằng đổi bộ chọn, chuẩn bị tuần tự hoặc song song; thưởng độ trễ |
| C20 | `9a3df9a` | Canary ít lưu lượng đo lâu hoặc nhiều lưu lượng đo ngắn; thưởng ít máy dư |
| C21 | `1549210` | Tăng trọng số hoặc tăng số khoảng đo trên cả bản tốt và xấu; thưởng đội máy nhỏ |
| C22 | `e3e5054` | Sửa tiến sau rolling hoặc canary; thưởng đội máy nhỏ |
| C23 | `73c7502` | Chuẩn bị cấu hình tuần tự hoặc song song, cùng chu kỳ đối soát; thưởng độ trễ |
| C24 | `56165b7` | Tự sửa theo nhịp hoặc chờ commit sửa trạng thái; thưởng drift ngắn |
| C25 | `b85bcf7` | Tự sửa kèm loại trừ trường hoặc chỉ phát hiện rồi đồng bộ Git; thưởng drift ngắn |
| C26 | `77cf5d1` | Cùng đăng ký các dạng bí mật, xử lý log/lưu ảnh song song hoặc tuần tự; thưởng độ trễ |
| C27 | `01199ec` | Duyệt song song kèm canary hoặc duyệt sau đủ báo cáo kèm blue-green; thưởng đội máy nhỏ |
| C28 | `f53ed2d` | Chuẩn bị song song + canary + tự sửa hoặc tuần tự + blue-green + chờ commit; cả hai che log; thưởng đội máy nhỏ |

Các mô tả trên ghi ý đồ trong mã nguồn, không phải kết quả chạy lời giải.

## Việc tiếp nối

- **Tích hợp web:** đọc mã nguồn cho thấy web vẫn nhập `CI_LEVELS`, chưa có nơi tiêu thụ
  cheatsheet `cd-panel`. Việc nối level và bảng điều khiển CD vào web được để riêng, không
  chỉnh web trong phạm vi viết nội dung hai lane.
- **Nghiệm thu:** chưa có bằng chứng mới cho AC-G; không chạy các lệnh nghiệm thu trong lượt này.
- **Mâu thuẫn ngưỡng xanh:** `score.ts` đếm pass xanh, không đếm commit xanh. C17/C27 chứa
  một commit bị từ chối trong mọi pass, nên đặt `minGreenRate: 0` để không phạt việc cổng
  làm đúng chức năng. Ô hình dạng hiện có trong `cd-levels.test.ts` đòi ngưỡng lớn hơn 0,
  mâu thuẫn với hai tình huống này. Giữ nguyên engine và file test theo phạm vi; cần điều
  chỉnh quy tắc nghiệm thu riêng cho bài có từ chối chủ ý khi chủ dự án mở lại việc đó.
- Không mở rộng hợp đồng engine, không sửa giao diện hoặc chạy lệnh xác minh.

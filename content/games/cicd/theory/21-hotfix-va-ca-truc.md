---
id: 21-hotfix-va-ca-truc
title: Hotfix và ca trực
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c27-hotfix-hai-gio-sang
  - cicd-c28-ca-truc-tong-hop
---

Hai giờ sáng, cảnh báo kêu, và có một hotfix cần lên prod. Đây là lúc mọi lớp bảo vệ trong đường ống trông như vật cản: cổng duyệt bắt chờ người, bước quét ảnh tốn vài phút, staging thêm một chặng. Cám dỗ lớn nhất của ca trực là **bỏ một lớp bảo vệ cho nhanh**.

## Mỗi lớp bảo vệ giữ một bảo đảm riêng

- **Cổng duyệt** giữ cho một đề xuất đã bị từ chối không tới được prod. Gỡ nó, và bản bị từ chối đi thẳng.
- **Thăng hạng** giữ cho prod chạy đúng ảnh đã chạy ở staging. Dựng lại "cho chắc" là phá danh tính đó.
- **Quét ảnh** giữ cho một lỗ hổng đã biết không đi kèm bản sửa.
- **Chiến lược phát hành** quyết định nếu chính hotfix có lỗi thì phục hồi mất bao lâu và giữ bao nhiêu máy dư.
- **Đối soát** quyết định một chỉnh tay lúc nửa đêm nằm lại bao lâu.
- **Bộ che log** quyết định lệnh debug vội vàng có làm lộ khoá hay không.

Không bảo đảm nào suy ra được từ bảo đảm khác. Một đường ống xanh không chứng minh bản ứng viên an toàn dưới tải. Phục hồi nhanh không chứng minh cấu hình hết drift hay log đã sạch.

## Nhanh hơn mà không bỏ gì

Phần lớn thời gian của một đường ống chậm là **chờ**, không phải làm. Trước khi gỡ một lớp bảo vệ, hãy tìm những việc đang xếp hàng sau nhau mà không cần nhau, và hỏi người duyệt thật sự cần thông tin gì để quyết. Duyệt sớm hơn thì nhanh hơn; duyệt sau khi đủ báo cáo thì chậm hơn nhưng người quyết biết nhiều hơn. Cả hai đều có thể là lựa chọn đúng.

Và nhớ rằng lead time của đường ống và thời gian phục hồi của lần phát hành là **hai ngân sách khác nhau**. Tối ưu cái này không tự trả nợ cho cái kia.

## Từ chối cũng là thành công

Một đề xuất bị từ chối làm lượt chạy đỏ. Ở ca trực, đó là cổng làm đúng việc. Một chỉ tiêu ép mọi lượt phải xanh sẽ đẩy đội tới chỗ gỡ chính cái cổng đó.

## Trong game này

- Hai level cuối chương ghép **đường ống** với cả **ba bộ mô phỏng**: phát hành, GitOps, che log. Bốn phần chạy **độc lập**: thời gian của workflow không sinh ra mốc chỉnh tay, không đổi nội dung log, và không cộng vào số giây phục hồi.
- Mỗi mục tiêu bắt buộc là một phép kiểm riêng. Level chỉ đạt khi **mọi** mục tiêu bắt buộc cùng đạt; không có điểm bù chéo giữa các mục.
- Level khoá chính sách theo **từng núm**. Núm không được mở luôn lấy giá trị ban đầu của level, bất kể bảng điều khiển gửi lên gì.
- Level có commit bị từ chối có chủ ý đặt ngưỡng tỷ lệ xanh bằng 0, và thay vào đó kiểm rằng prod được canh bởi cổng duyệt.
- Một mục tiêu đọc bộ mô phỏng mà level không khai kịch bản tương ứng thì **không đạt**, không bị bỏ qua.

---
id: 08-retry-va-loi-that
title: Retry và lỗi thật
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c10-retry-khong-cuu-duoc-do-that
  - cicd-c11-chay-lai-che-mat-loi-that
---

Retry là một cái búa rất tiện, và nó chỉ đóng được một loại đinh. Trước khi thêm nó, hãy hỏi một câu: **lần thử sau có gì khác lần thử trước không?**

## Hai họ nguyên nhân đỏ

**Ngẫu nhiên.** Máy hết bộ nhớ, mạng chớp, container khởi động chậm. Lần thử sau rút một con xúc xắc mới, nên thử lại có nghĩa.

**Cấu trúc.** Thiếu một cạnh phụ thuộc, lấy nhầm một cache đã ôi, một job phía trên đã đỏ. Lần thử sau gặp đúng thế giới cũ, nên nó đỏ lại, và bạn vừa trả thêm thời gian máy cho một bản sao của thất bại. Một job sáu phút với ba lần thử lại đốt hai mươi bốn phút runner trước khi chịu thua, ở mỗi commit.

Đặt retry khắp nơi "cho chắc" vì thế không phải chiến lược an toàn. Nó là một khoản chi phí, và nó còn là một quả mìn: vô hại hôm nay, rồi một ngày job đó đỏ vì lý do khác và đốt gấp bốn trước khi báo.

## Không phải đỏ ngẫu nhiên nào cũng là đỏ giả

Chỗ khó nhất nằm trong chính họ ngẫu nhiên. Một bước kiểm thử đỏ 5% số lần có thể là máy ảo chậm. Nó cũng có thể là một **cuộc đua luồng có thật** trong mã, chỉ thua cuộc 5% số lần.

Trong lúc chạy, hai thứ đó phát ra đúng một tín hiệu: một ô đỏ. Thử lại xoá ô đỏ trong cả hai trường hợp. Ở trường hợp đầu, bạn vừa cứu một lượt chạy. Ở trường hợp sau, bạn vừa phát hành một lỗi và xoá luôn bằng chứng duy nhất cho thấy nó tồn tại.

Đường ống càng "ổn định" nhờ thử lại thì càng ít nói sự thật. Tỷ lệ xanh 100% đạt được bằng cách bấm chạy lại là một cái đồng hồ đã tháo pin. Sau khi thôi che, tỷ lệ xanh sẽ tụt, và con số mới đó mới là con số thật.

## Trong game này

- Mỗi lần đỏ mang một **nguyên nhân** là dữ liệu, không phải câu chữ: `flake` (đỏ ngẫu nhiên), `missing-output`, `stale-cache`, `upstream-failed`, và `approval-rejected` ở chương CD. Chỉ `flake` có thể xanh ở lần thử sau.
- Nếu một bước vừa thiếu sản phẩm vừa trúng cache ôi vừa rơi vào đỏ ngẫu nhiên, nguyên nhân được báo theo thứ tự `missing-output`, rồi `stale-cache`, rồi `flake`. Lỗi cấu trúc luôn được gọi tên trước.
- Retry đặt ở **tầng stage**. Mỗi lần thử lại chạy lại mọi bước, đốt trọn runner-phút của cả stage, và xếp hàng lại như một việc mới sẵn sàng. Stage bị chặn vì phía trên đỏ thì không bao giờ được thử lại.
- Đỏ ngẫu nhiên có một **bản chất**: `infra` (hạ tầng) hoặc `latent-defect` (lỗi thật chỉ lộ đôi lúc). Trong lúc chạy hai loại trông **giống hệt nhau**; bản chất chỉ hiện ở bảng tổng kết sau khi cả lần chấm kết thúc.
- Một **khiếm khuyết lọt xuống** được đếm khi một lần thử đỏ vì `latent-defect` nằm trong một stage mà lần thử cuối cùng lại xanh. Tức là đúng những lần một retry đã che đi lỗi thật.
- Số lần thử lại là một con số cho cả stage. Mọi bước trong stage dùng chung con số đó, bất kể bản chất lỗi của từng bước.

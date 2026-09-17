---
id: 15-rolling-va-blue-green
title: Rolling và blue-green
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c18-rolling-tung-dot
  - cicd-c19-blue-green-doi-bo-chon
---

Phát hành một bản mới lên một đội máy đang phục vụ lưu lượng thật có nhiều cách. Hai cách phổ biến nhất khác nhau ở một câu hỏi: **khi bản mới có lỗi, quay về mất bao lâu, và phải giữ bao nhiêu máy dư để mua tốc độ đó?**

## Rolling: thay từng đợt

Rolling thay đội máy theo **đợt**. Mỗi đợt, vài máy mới khởi động, nhận lưu lượng, rồi máy cũ tương ứng tắt. Kubernetes làm đúng việc này với `maxSurge` và `maxUnavailable`.

Đỉnh tài nguyên thấp: chỉ cần thêm đúng số máy của một đợt. Cái giá nằm ở đường lùi. Lùi rolling cũng là thay máy, theo chiều ngược lại, nên càng nhiều đợt đã đổi thì lùi càng lâu. Đợt nhỏ trông thận trọng, nhưng tới lúc cảnh báo kêu thì nhiều đợt đã bắt đầu. Đợt lớn lùi nhanh hơn và giữ nhiều máy dư hơn.

## Blue-green: đổi bộ chọn

Blue-green dựng **đủ một môi trường thứ hai** cạnh môi trường đang chạy. Khi môi trường mới sẵn sàng, bộ chọn lưu lượng (load balancer, Service selector) chuyển sang đó. Môi trường cũ vẫn còn nguyên.

Nếu bản mới lỗi và dữ liệu còn tương thích, quay về chỉ là đổi bộ chọn về, vài giây. Tốc độ đó không miễn phí: suốt lượt phát hành, bạn giữ **gấp đôi** số máy.

## Lùi hay tiến

Phát hiện lỗi rồi, còn một lựa chọn nữa: **lùi** về bản cũ, hay **tiến** bằng một bản sửa. Tiến nhanh khi bản sửa đã sẵn sàng, chậm khi phải dựng từ đầu. Đồng hồ khôi phục bắt đầu từ lúc **quyết định rút** bản lỗi, không phải lúc bắt đầu phát hành.

## Trong game này

Bộ mô phỏng phát hành đếm bằng **giây nguyên**, không bằng tick. Tình huống (số máy, thời gian khởi động một máy, thời gian đổi bộ chọn, thời gian tới lúc cảnh báo, thời gian dựng bản sửa, bản ứng viên tốt hay lỗi) là dữ liệu của level.

- **Rolling.** Số đợt là số máy chia kích thước đợt, làm tròn lên. Đợt thứ k (đếm từ 0) bắt đầu ở giây k × thời gian thay. Bản mới nhận lưu lượng sau đợt đầu. Đỉnh là số máy cộng kích thước đợt. Bản lỗi: quyết định rút ở lúc nhận lưu lượng cộng thời gian cảnh báo; mọi đợt **đã bắt đầu** tới lúc đó, kể cả đợt dở dang, phải thay lại, mỗi đợt một lần thời gian thay.
- **Blue-green.** Bản mới nhận lưu lượng sau khi dựng xong cả đội và đổi bộ chọn. Đỉnh là **hai lần** số máy. Lùi mất đúng thời gian đổi bộ chọn.
- **Ví dụ không thuộc level nào:** 6 máy, thay một đợt 30 giây, cảnh báo sau 50 giây. Rolling đợt 3 máy: 2 đợt, rút ở giây 80, cả 2 đợt đã bắt đầu, lùi 60 giây, đỉnh 9 máy. Đợt 1 máy: 3 đợt đã bắt đầu, lùi 90 giây, đỉnh 7 máy.
- **Tiến** thì phục hồi sau đúng thời gian dựng bản sửa, bất kể chiến lược.
- Rolling và blue-green **không có báo động giả**: bản tốt không bao giờ bị rút, và không có ngẫu nhiên nên mọi lượt giống nhau.
- Mục tiêu thời gian khôi phục đòi mọi lượt đã rút bản đều **dưới** ngưỡng, và phải có ít nhất một lượt rút. Level có thể khoá chiến lược và chỉ mở vài núm cho bạn.

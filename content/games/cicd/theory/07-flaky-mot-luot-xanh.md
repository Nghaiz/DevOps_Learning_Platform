---
id: 07-flaky-mot-luot-xanh
title: Một lượt xanh không chứng minh gì
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c09-mot-luot-xanh-khong-chung-minh-gi
---

Một bộ kiểm thử **flaky** là bộ đỏ "thỉnh thoảng" mà mã không đổi gì. Cả đội quen bấm chạy lại, thấy xanh, rồi đi tiếp. Câu "tôi chạy thử rồi, nó xanh" nghe như bằng chứng. Nó là một mẫu.

## Sai ở cỡ mẫu, không sai ở quan sát

Giả sử một bước đỏ 10% số lần. Nhìn vào nó một lần thì chín phần mười bạn thấy xanh. Quan sát đó hoàn toàn đúng. Kết luận "đã hết lỗi" thì sai, vì một lần tung đồng xu không nói được gì về đồng xu.

Xác suất cộng dồn nhanh hơn trực giác. Bước đỏ 10% chạy cho hai commit thì cả hai cùng xanh chỉ khoảng 81% số lần, tức cứ năm lượt lại có gần một lượt đỏ. Thêm commit, thêm bước hay hỏng, con số tụt tiếp.

Đọc nhiều lượt và nhìn **tỷ lệ**, không nhìn lượt cuối cùng. 17/20 và 20/20 là hai kết luận khác nhau. Và nhớ rằng 5/6 cũng gần bằng 17/20, nhưng cỡ mẫu nhỏ hơn nhiều nên đáng tin kém hơn nhiều.

## Thử lại là công cụ đúng, cho đúng loại hỏng

Khi lần đỏ đến từ **hạ tầng** (máy ảo khởi động chậm, mạng chớp, runner hết bộ nhớ), lần thử sau gặp một thế giới khác, nên thử lại có nghĩa. Nhưng có một cái giá dễ bỏ qua: thử lại thường đặt ở tầng job. Nút "Re-run failed jobs" chạy lại **mọi bước** của job đỏ, kể cả những bước chưa bao giờ hỏng. Một job dài mà chỉ có một bước ngắn hay hỏng thì mỗi lần thử lại đốt trọn thời gian của cả job. Trước khi đặt số lần thử lại, hãy xem bước nào trong job thật sự là bước hay hỏng, và nó chiếm bao nhiêu phần thời gian của job.

## Trong game này

- Mỗi lần chấm chạy **nhiều lượt mô phỏng**, mặc định 20. Giao diện hiện tỷ lệ lượt xanh dạng "17/20", không chỉ một chữ đạt hay trượt. Một lượt chỉ xanh khi **mọi commit** của lượt đó xanh.
- Mỗi bước hay hỏng có một tỷ lệ đỏ cố định cho mỗi lần thử. Con xúc xắc được rút theo **khoá**: lượt thứ mấy, commit nào, thực thể nào, lần thử thứ mấy. Thêm máy hay đổi thứ tự xếp lịch làm đổi *khi nào* bước chạy, không đổi *nó rút được gì*. Nhờ vậy so hai lời giải trên cùng hạt giống là so trên cùng một thế giới.
- Thử lại đặt ở **tầng stage**: stage đỏ nhả máy, xếp hàng lại sau các thực thể đã sẵn sàng, rồi chạy lại mọi bước với xúc xắc mới. Runner-phút cộng dồn **mọi** lần thử.
- Hạt giống của level được chọn có chủ ý, và cùng hạt giống thì cùng kết quả ở mọi lần chấm. Bạn không "gặp may" được bằng cách bấm chấm lại.
- Lead time và thông lượng lấy trung vị qua các lượt, nên vài lượt thử lại không kéo hai con số đó đi xa. Runner-phút thì lấy trung bình, nên mỗi lần thử lại đều hiện ra ở trục thứ ba.

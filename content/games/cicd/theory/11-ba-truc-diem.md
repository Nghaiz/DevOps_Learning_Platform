---
id: 11-ba-truc-diem
title: Ba trục điểm không gộp được
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c14-toi-uu-ba-truc
---

Người ta hay nói về một đường ống "nhanh" như thể chỉ có một con số. Thật ra có ít nhất ba đại lượng, và chúng không phải ba cách nói về cùng một thứ.

## Ba đại lượng

**Lead time** là một commit mất bao lâu từ lúc đẩy lên tới lúc xong. Đó là độ trễ của **một lô**. Hạ nó bằng cách bỏ những lần chờ không cần thiết ra khỏi đường găng.

**Thông lượng** là bao nhiêu commit qua được mỗi giờ khi hàng dồn. Đó là năng lực của **cả hệ**. Hai đường ống cùng lead time có thể khác thông lượng rất xa: một cái chỉ xử lý được một commit mỗi lúc, cái kia để nhiều commit chạy chồng nhau theo kiểu dây chuyền.

**Runner-phút** là tổng thời gian máy đã dùng, cộng mọi job và mọi lần thử lại. Đó là chi phí. Tách việc thành các nhánh song song không hạ nó một chút nào: cùng bấy nhiêu việc, chỉ khác lúc nào làm. Muốn hạ nó thì phải **làm ít việc đi**: cache một bước, bỏ một bước trùng, thôi thử lại những thứ không thử lại được.

## Vì sao không gộp thành một điểm

Ba trục kéo nhau đi ngược hướng ở đúng những chỗ đáng học. Thêm runner hạ lead time, nhưng một dàn máy lớn hơn vẫn tốn kém cả lúc ngồi rảnh. Tách nhánh hạ lead time mà giữ nguyên runner-phút. Cache hạ cả hai. Gộp ba con số thành một điểm là giấu mất chính những đánh đổi đó, và mời người đọc tối ưu một con số mà không biết mình vừa trả bằng gì.

Tỷ lệ xanh thì là chuyện khác: nó là **ngưỡng đạt hay trượt**, không phải một trục để đánh đổi. Không đường ống nào đáng đổi độ tin cậy lấy tốc độ.

## Trung vị hay trung bình

Phân bố lead time thường có hai đỉnh: những lượt chạy trơn tru, và những lượt phải thử lại. Trung bình rơi vào thung lũng giữa hai đỉnh và mô tả một lượt chạy **chưa từng xảy ra**. Nên với trải nghiệm, người ta đọc trung vị kèm phân vị cao. Với chi phí thì ngược lại: phần máy đốt thêm ở lượt xấu là thời gian máy thật, bỏ nó đi là báo thấp hơn mức tiêu tốn thật.

## Trong game này

- **Lead time** là trung vị, qua mọi commit của mọi lượt, của `(tick xong − tick tới) × 10` giây.
- **Thông lượng** mỗi lượt là số commit × 3600 chia cho (tick kết thúc cả lượt × 10), rồi lấy trung vị qua các lượt. Tick kết thúc tính từ tick 0 của lượt.
- **Runner-phút** là tổng `số chỗ máy × tick` của mọi thực thể và mọi lần thử, quy ra phút, rồi lấy **trung bình** mỗi lượt. Chỉ thời gian máy đang bận được tính; máy ngồi rảnh không cộng vào trục này.
- Trung vị theo **hạng gần nhất**, không nội suy, nên con số đem chấm luôn là giá trị đã xảy ra ở một lượt cụ thể. Giao diện vẫn trả cả phân vị 10, 90, nhỏ nhất, lớn nhất và toàn bộ mẫu.
- Level dạy thông lượng có **ít nhất ba commit**. Với một commit duy nhất, thông lượng chỉ là 3600 chia lead time, và ba trục tụt còn hai.
- Mỗi level có mốc "chuẩn" và trần cứng riêng cho từng trục, suy từ đo đạc của chính level đó. Workflow có lỗi cấu trúc thì không có con số nào, không phải ba số 0.

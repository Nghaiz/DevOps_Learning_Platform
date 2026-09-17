---
id: 17-migration-khong-lui
title: Migration không có đường lùi
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c22-migration-khong-lui
---

Rollback ứng dụng là đưa **mã** cũ trở lại. Nó không đưa **dữ liệu** cũ trở lại.

Một bản phát hành đổi lược đồ cơ sở dữ liệu, chẳng hạn xoá một cột, đổi kiểu một cột, hay gộp hai bảng. Bản mới có lỗi. Đội bấm lùi. Bản cũ khởi động lại và đi tìm cái cột không còn tồn tại. Giờ dịch vụ vẫn hỏng, chỉ là hỏng theo một cách khác, và dữ liệu có thể bị ghi sai trong lúc đó.

## Ba loại migration

- **Không có**: bản mới dùng đúng lược đồ cũ. Lùi an toàn.
- **Lùi được**: thay đổi tương thích với bản cũ, ví dụ thêm một cột cho phép rỗng. Bản cũ bỏ qua cột đó và vẫn chạy.
- **Không lùi được**: bản cũ không đọc được lược đồ mới. Lùi ứng dụng không phải phục hồi.

Khi migration không lùi được, đường ra còn lại là **tiến**: dựng một bản sửa tương thích với lược đồ mới và đưa nó lên. Thời gian phục hồi khi đó là thời gian dựng bản sửa, và không chiến lược phát hành nào rút ngắn được nó.

## Tạo lại đường lùi từ trước

Cách các đội tránh tình huống này là **expand/contract** (còn gọi là parallel change): chia một thay đổi lược đồ phá vỡ thành nhiều lần phát hành, mỗi lần tương thích với bản trước nó.

1. Thêm cột mới, giữ cột cũ. Bản mới ghi cả hai.
2. Chuyển dữ liệu cũ sang cột mới.
3. Bản sau chỉ đọc cột mới.
4. Khi không bản nào còn dùng, mới xoá cột cũ.

Mỗi bước đều lùi được về bước ngay trước. Chậm hơn một lần đổi thẳng, nhưng ở mọi thời điểm bạn còn đường lùi.

## Đừng thắng bằng cách không làm gì

Một đường ống không bao giờ rút bản lỗi thì cũng không bao giờ gây sự cố dữ liệu vì lùi. Nó chỉ để nguyên bản lỗi phục vụ người dùng. Tránh sự cố dữ liệu phải đi cùng việc xử lý bản lỗi.

## Trong game này

- Loại migration là **dữ liệu của tình huống**: không có, lùi được, hoặc không lùi được. Chỉ loại cuối cùng chặn đường lùi; loại lùi được cư xử như không có migration.
- Khi quyết định rút bản lỗi, kết cục phụ thuộc lựa chọn của bạn. **Tiến**: kết cục `rolled-forward`, phục hồi sau thời gian dựng bản sửa. **Lùi** trên migration không lùi được: kết cục `rollback-blocked`, và mốc phục hồi cũng là lúc bản sửa lên, vì lùi xong mà dữ liệu hỏng thì chưa phục hồi gì. **Lùi** ở các trường hợp còn lại: `rolled-back`, phục hồi sau thời gian lùi của chiến lược.
- Mỗi lượt `rollback-blocked` được đếm là một **sự cố dữ liệu**.
- Mục tiêu "không sự cố dữ liệu" luôn đi kèm mục tiêu "không giữ lại bản lỗi" hoặc giới hạn thời gian phục hồi, để lời giải "không bao giờ rút" không qua được.
- Đổi chiến lược phát hành đổi số máy cao nhất và thời điểm phát hiện, nhưng không đổi sự thật rằng lược đồ đã đổi.

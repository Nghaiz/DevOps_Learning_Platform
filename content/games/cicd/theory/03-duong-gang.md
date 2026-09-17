---
id: 03-duong-gang
title: Đường găng
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c04-duong-gang
---

Khái niệm **đường găng** (critical path) đến từ quản lý dự án: trong một mạng công việc có quan hệ trước sau, chuỗi dài nhất quyết định ngày xong. Mọi việc nằm ngoài chuỗi đó đều có **thời gian dư**. Làm chúng nhanh hơn không kéo ngày xong lại một ngày nào.

Với đường ống CI, "ngày xong" là lúc commit xanh. Đường găng dài đúng bằng lead time.

## Nằm trên đường găng khác với đáng sửa

Hai sai lầm phổ biến đi thành cặp.

Sai lầm thứ nhất là tối ưu một job **ngoài** đường găng, thường là job dễ sửa nhất. Bảng thời gian cho thấy nó chạy nhanh hơn, còn commit vẫn xanh đúng lúc cũ.

Sai lầm thứ hai là tối ưu một mắt xích **ngắn** trên đường găng. Nó có nằm trên chuỗi thật, nhưng đã cạn: có đưa nó về không thì lead time cũng chỉ giảm vài giây, trong khi mắt xích dài nhất vẫn ngồi đó.

## Chỉ có hai cách rút ngắn

- **Đổi hình dạng**: gỡ một cạnh không có thật để những việc độc lập rời khỏi chuỗi.
- **Rút ngắn một đỉnh trên chuỗi**: chẻ việc dài thành các phần chạy song song, hoặc làm nó rẻ đi.

Sau mỗi lần sửa, đường găng **đổi chỗ**. Mắt xích dài thứ hai trở thành mắt xích quyết định, và vòng tối ưu tiếp theo phải đọc lại từ đầu.

Và một điều dễ quên: rút ngắn đường găng không làm giảm tổng công việc. Bạn mua thời gian, không tiết kiệm máy.

## Khi máy hữu hạn, đường găng không chỉ đi theo cạnh

Sách quản lý dự án giả định nguồn lực vô hạn. Đường ống thật thì không. Một job có thể xong muộn không phải vì chờ job nào, mà vì chờ một **runner** rảnh. Nếu chỉ đi theo cạnh của đồ thị, bạn sẽ tô sáng một chuỗi không giải thích được thời điểm kết thúc thật, rồi đi sửa đồ thị trong khi thứ cần sửa là số máy.

## Trong game này

- Sau mỗi lượt chạy, đường găng được **tô sáng**. Nó được dựng bằng cách đi ngược từ thực thể xong muộn nhất, theo chính ràng buộc đã quyết định thời điểm bắt đầu của từng thực thể.
- Ràng buộc đó được **ghi lúc xếp lịch**, không suy lại sau. Có hai loại: chờ phụ thuộc (ghi phụ thuộc xong muộn nhất) và chờ máy (ghi thực thể vừa nhả chỗ). Hai loại được vẽ khác nhau, vì cạnh chờ máy không có trong đồ thị bạn viết.
- Bảng ba trục cho biết mỗi stage mất bao lâu, nhưng không cho biết stage nào quyết định lúc xong. Chỉ đường găng nói điều đó.
- Mục tiêu dạng "stage nằm trên / ngoài đường găng" đếm theo **tỷ lệ lượt chạy**, không theo một lượt duy nhất. Ở level có nhiễu thời lượng, một stage có thể lúc nằm trên, lúc nằm ngoài.
- Level dạy đường găng giãn các commit đủ xa để chúng không chồng lên nhau. Khi commit chồng nhau, chuỗi có thể đi sang thực thể của commit khác và khó đọc hơn nhiều.

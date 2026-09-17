---
id: 10-gom-ket-qua-nhieu-nhanh
title: Gom kết quả của nhiều nhánh
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c13-gom-ket-qua-nhieu-nhanh
---

Quạt ra là nửa đầu câu chuyện. Nửa sau là **gom lại** (fan-in), và đó là nửa người ta hay quên hỏi: *ai đang chờ các nhánh đó?*

## Một cạnh là đủ

Khi một job được quạt thành nhiều bản, job nào khai `needs` tới nó sẽ chờ **tất cả** các bản xong, không phải bản xong đầu tiên. Không có cú pháp riêng cho fan-in, không có danh sách phải liệt kê tay.

```yaml
jobs:
  kiem-thu:
    strategy:
      matrix:
        node: [20, 22]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
  xuat-ban:
    needs: [kiem-thu]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm publish
```

Chỉ cần một bản của ma trận đỏ, job gom mặc định không chạy.

## Cái bẫy: đồ thị hợp lệ mà không chờ ai

Lỗi phổ biến không nằm ở cú pháp. Nó nằm ở chỗ job cuối cùng đang phụ thuộc vào một thứ **nằm trước** ma trận, chẳng hạn job biên dịch, chứ không phải chính ma trận. Đồ thị vẫn hợp lệ, không chu trình, không cạnh chết. Nó chỉ không chờ kết quả kiểm thử.

Nếu job xuất bản không đòi gì từ các nhánh kiểm thử, đường ống sẽ **xanh** trong khi vẫn phát hành trước lúc biết kiểm thử nói gì. Một lỗi đỏ còn dạy được; một lỗi xanh thì không. Hãy để job cuối **đòi đúng thứ nó cần**, như báo cáo kiểm thử để đính kèm. Đó là cách rẻ nhất để một cạnh thiếu tự khai báo.

## Cổng tổng hợp tường minh

Nhiều đội đặt một job trung gian chỉ để gom kết quả, rồi cho các job phát hành chờ nó. Lợi ích là có một chỗ nhìn thấy được trên đồ thị để treo thêm điều kiện về sau, và một tên duy nhất để đặt làm kiểm tra bắt buộc khi gộp nhánh. Cái giá là một job thật: thêm một chỗ runner và thêm một khoảng thời gian trên đường găng. Cả hai cách đều đúng. Chúng chỉ đánh đổi khác nhau.

## Trong game này

- Một stage phụ thuộc vào stage đã quạt thì sẵn sàng khi **mọi thực thể** của stage đó xong. Cạnh luôn trỏ tới stage, không trỏ tới một thực thể riêng lẻ.
- Nếu stage đã quạt là stage chặn và chỉ **một** thực thể của nó đỏ ở lần thử cuối, stage phía sau không chạy và mang nguyên nhân `upstream-failed`.
- Khi nhiều thực thể phía trên cùng tạo ra một sản phẩm, bước phía sau nhận bản của thực thể **xong muộn nhất**; hoà thì lấy khoá thực thể nhỏ hơn. Bản ghi lưu rõ thực thể nào đã cấp sản phẩm.
- Sản phẩm do các nhánh tạo ra chỉ tới được bước phía sau qua cạnh phụ thuộc, kể cả bắc cầu qua một cổng trung gian. Một stage khởi động song song với ma trận mà có bước đòi sản phẩm của các nhánh sẽ đỏ `missing-output` ở mọi lượt.
- Một commit chỉ xanh khi mọi thực thể của mọi stage chặn đều xanh.

---
id: 05-cache-dat-dung-cho
title: Cache phải đặt đúng chỗ
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c06-cache-la-buffer
---

Cache trong CI là một cái đệm giữa hai lần chạy: lượt trước lưu lại kết quả của một bước tốn thời gian, lượt sau lấy về thay vì làm lại. Nó không phải phép màu. Một cache tiết kiệm được **nhiều nhất là thời lượng của chính bước nó đứng**.

Cache một bước mười giây thì bạn lấy lại tối đa mười giây, dù ở đâu đó có dòng chữ khoe "tiết kiệm hai phút". Nó không rút ngắn được bước khác, không rút ngắn được thời gian chờ runner, và không động tới stage nào khác trên đường găng.

## Đặt cache là một bài đọc số

Tìm bước **tốn nhất** mà kết quả **lặp lại được** giữa hai commit, rồi đặt cache ở đó. Cài gói phụ thuộc là ví dụ kinh điển: danh sách gói chỉ đổi khi tệp khoá phụ thuộc đổi, vài lần một tháng chứ không phải mỗi commit.

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/cache@v4
    with:
      path: ~/.npm
      key: goi-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
  - run: npm ci
```

Khoá băm vào tệp khoá phụ thuộc, nên nó chỉ đổi đúng khi danh sách gói đổi.

Ngược lại, cache một bước một giây không mua được gì: mỗi mục cache vẫn là một lần tra khoá và một lần khôi phục phải chạy.

## Cache không bao giờ trúng mãi

Ngày tệp khoá đổi, cache trượt và đường ống quay về đúng tốc độ lúc chưa có cache. Lần chạy đầu tiên sau khi mục cache bị dọn vì lâu không dùng cũng vậy. Hãy đặt ngưỡng thời gian sao cho những ngày đó vẫn chấp nhận được, vì chúng chắc chắn sẽ tới.

Và trước khi thêm cache, hãy nhìn đường găng. Làm rẻ một bước không nằm trên đường găng giảm được chi phí máy, nhưng không làm commit xanh sớm hơn.

## Trong game này

- Cache gắn vào **bước**, không gắn vào stage. Bạn bật hoặc tắt nó ở bảng điều khiển và chọn những đầu vào tạo khoá. Số tick tiết kiệm và thứ thật sự làm nội dung ôi là **dữ liệu của level**.
- Trúng và nội dung còn đúng thì bước bớt đúng số tick tiết kiệm, nhưng **bị kẹp** ở thời lượng của bước. Phần khai dư bị bỏ đi trong im lặng.
- Mỗi đầu vào của workspace đổi theo một nhịp cố định: đầu vào có chu kỳ n đổi ở commit thứ n, 2n, 3n, đếm từ 1. Bảng đầu vào cho bạn đọc nhịp đó, không có xác suất nào ở đây.
- Mục cache chỉ được **ghi khi bước xanh** và khi lần tra trước đó trượt. Nó được ghi lúc lần thử kết thúc, nên hai commit chạy chồng nhau có thể cùng trượt.
- Mỗi lượt mô phỏng bắt đầu với **kho cache trống**, nên commit đầu tiên của lượt luôn trượt.
- Số lần trúng được cộng dồn qua cả lần chấm và hiện cạnh ba trục điểm. Cache làm giảm runner-phút ở mọi commit trúng; nó chỉ hạ lead time khi bước được cache nằm trên đường găng.

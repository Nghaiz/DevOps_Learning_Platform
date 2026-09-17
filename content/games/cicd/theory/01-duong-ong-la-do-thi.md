---
id: 01-duong-ong-la-do-thi
title: Đường ống là một đồ thị
gameId: cicd
readMinutes: 3
usedByLevels:
  - cicd-c01-mot-job-mot-step
  - cicd-c02-canh-phu-thuoc
---

Người mới viết CI thường hình dung đường ống như một danh sách việc: tải mã, build, chạy test, đóng gói, cứ thế từ trên xuống. Bộ xếp lịch không đọc danh sách đó. Nó đọc một **đồ thị có hướng không chu trình** (DAG): mỗi job là một đỉnh, mỗi quan hệ "phải xong trước" là một cạnh.

Trong game, job được gọi là **stage**. Thứ tự bạn viết các stage chỉ để người đọc dễ theo dõi. Thứ tự chạy do cạnh quyết định.

## Hai tầng: stage và bước

**Stage** là đơn vị được xếp lịch. Nó xin một máy chạy (runner), giữ máy đó suốt thời gian làm việc, rồi trả lại. Hai stage không nối với nhau có thể chạy cùng lúc nếu còn máy.

**Bước** là một lệnh bên trong stage. Các bước chạy **nối tiếp** trên đúng máy của stage đó. Chia một stage thành mười bước không làm nó nhanh hơn chút nào.

```yaml
jobs:
  clone:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
  kiem-tra:
    needs: [clone]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
```

Ở đây `kiem-tra` có hai bước chạy lần lượt, và khoá `needs` là cạnh nối nó với `clone`.

## Một cạnh làm hai việc

Cạnh quyết định **thứ tự**, và cũng quyết định **sản phẩm đi đường nào**. Ngoài đời, mỗi job chạy trên một máy riêng, không chung đĩa. Job sau muốn dùng thứ job trước tạo ra thì phải đợi job đó xong rồi nhận artifact. Thiếu cạnh thì thường thành một cuộc đua: hôm nay job kia xong trước nên xanh, mai nó chậm hơn nên đỏ.

Một lỗi may rủi như vậy rất khó sửa, vì lần bạn nhìn vào nó có thể đang xanh.

## Chu trình không có điểm từng phần

Nếu A đợi B và B đợi A thì không stage nào bắt đầu được. Không có "gần đúng" ở đây. Một workflow có chu trình không phải một workflow chậm, nó là một workflow không chạy.

## Trong game này

- Thời gian đo bằng **tick**, một tick là 10 giây. Thời lượng của từng bước là dữ liệu của level, bạn không gõ nó vào YAML.
- Một stage chiếm một máy từ lúc bắt đầu tới lúc xong. Thời lượng stage là tổng thời lượng các bước đã chạy.
- Mỗi bước có thể khai sản phẩm nó **cần** và sản phẩm nó **tạo ra**. Bước chỉ thấy sản phẩm do các stage mà stage của nó phụ thuộc, **kể cả bắc cầu** qua nhiều cạnh, tạo ra trong cùng commit, ở những bước đã xanh.
- Game chặt hơn đời thật ở một chỗ có chủ ý: hai stage không nối với nhau **không bao giờ** thấy sản phẩm của nhau, kể cả khi một bên xong trước. Thiếu cạnh là đỏ với nguyên nhân `missing-output`, ở mọi lượt, và thử lại không cứu được. Cuộc đua biến thành một lỗi đọc ra được.
- Một bước đỏ mà đang chặn thì các bước sau nó trong cùng stage không chạy. Stage phía sau một stage chặn bị đỏ sẽ không chạy và mang nguyên nhân `upstream-failed`.
- Chu trình, hoặc một cạnh trỏ tới stage không tồn tại, làm cả lần chấm báo lỗi và không có con số nào để đọc.
- Bộ xếp lịch sắp stage theo mã định danh, không theo vị trí trong ô soạn. Đổi chỗ hai stage trong văn bản không đổi kết quả.

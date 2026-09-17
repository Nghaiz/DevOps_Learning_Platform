---
id: 09-ma-tran
title: Ma trận quạt một job ra nhiều bản
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c12-ma-tran-quat-ra
---

Một thư viện phải chạy được trên nhiều phiên bản runtime, nhiều hệ điều hành. Cách viết ngây thơ nhất là lặp lại lệnh kiểm thử thành nhiều bước trong cùng một job. Nó đúng, và nó chậm một cách không cần thiết: các bước chạy **nối tiếp trên cùng một máy**, nên dàn máy có rảnh bao nhiêu thì các lần kiểm thử vẫn xếp hàng sau nhau.

Máy chạy được cấp cho job, không cho bước. Muốn song song thật thì phải có nhiều **bản job**.

## Ma trận

Ma trận khai một job một lần rồi quạt nó ra theo các trục. Mỗi tổ hợp giá trị là một bản job riêng, chiếm runner riêng, chạy và đỏ riêng.

```yaml
jobs:
  kiem-thu:
    needs: [bien-dich]
    runs-on: ${{ matrix.he-dieu-hanh }}
    strategy:
      matrix:
        he-dieu-hanh: [ubuntu-latest, windows-latest]
        node: [20, 22]
        exclude:
          - he-dieu-hanh: windows-latest
            node: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
```

Hai trục hai giá trị cho bốn tổ hợp, trừ một tổ hợp bị loại, còn ba bản chạy.

## Ma trận không làm ít việc đi

Quạt ra không giảm tổng công việc. Ba lần kiểm thử tám phút vẫn là hai mươi bốn phút runner, chỉ khác là chúng chạy trên ba máy cùng lúc thay vì một máy nối tiếp. Lead time đi xuống, chi phí máy đứng yên. Đây là một trong những chỗ hai trục đó tách nhau rõ nhất.

Và song song vẫn cần máy. Quạt ra nhiều bản hơn số runner rảnh thì các bản vẫn chạy, chỉ là xếp hàng, và bạn mất đúng thứ vừa mua.

## Chép tay hay khai một chỗ

Viết ba job gần giống nhau cũng cho ba bản song song, và đo ra cùng con số. Cái giá nằm ở chỗ khác: ba chỗ phải sửa khi đổi một tham số, và số chỗ đó nhân lên theo mỗi trục bạn thêm.

## Trong game này

- Một stage khai `fanOut` với danh sách **trục**, mỗi trục có tên và ít nhất một giá trị. Mỗi tổ hợp là một **thực thể** có khoá dạng `kiem-thu#20/ubuntu`, giá trị theo đúng thứ tự trục.
- Tổ hợp sinh theo kiểu đếm số: **trục đầu đổi chậm nhất**. Thứ tự này không phải trang trí, vì khoá thực thể đi vào khoá rút xúc xắc và vào thứ tự hàng đợi.
- `exclude` liệt kê khoá thực thể đầy đủ. Loại hết mọi tổ hợp là hợp lệ: stage không có thực thể nào, và stage phụ thuộc nó không phải chờ ai.
- Mỗi thực thể chiếm một chỗ máy, rút xúc xắc riêng, được thử lại riêng. Hai thực thể của cùng stage cùng sẵn sàng thì thực thể có chỉ số nhỏ hơn được xếp trước.
- Runner-phút cộng mọi thực thể. Một ma trận ba giá trị đốt đúng gấp ba một thực thể, dù lead time giảm.

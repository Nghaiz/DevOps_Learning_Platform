---
id: 04-viec-khong-chan
title: Việc không chặn
gameId: cicd
readMinutes: 2
usedByLevels:
  - cicd-c05-viec-khong-chan
---

Không phải lần đỏ nào cũng đáng dừng cả đường ống.

Build đỏ thì không có gì để đóng gói, dừng lại là đúng. Nhưng một bộ kiểm thử tích hợp đang gọi sang một dịch vụ nội bộ bị sập, hay một lần soi mã chỉ mang tính khuyến nghị, thì chặn mọi commit của cả đội là đánh đổi sai: bạn dừng công việc của mọi người vì một thứ không nói gì về mã của họ.

## Hai tầng đặt công tắc

GitHub Actions cho đặt `continue-on-error` ở cả job lẫn bước:

```yaml
jobs:
  kiem-tra-tich-hop:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v4
      - run: ./scripts/goi-dich-vu-thong-bao.sh
  soi-ma:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run lint
        continue-on-error: true
```

Hai chỗ đặt cho ra hai bản ghi rất khác nhau.

- **Ở tầng job**: job vẫn hiện ĐỎ, nhưng lượt chạy không đỏ theo và job phía sau vẫn chạy. Tín hiệu còn nguyên, ai đó vẫn nhìn thấy và đi sửa.
- **Ở tầng bước**: bước đỏ, nhưng job kết thúc XANH. Gọn mắt hơn, và chính vì gọn mắt mà nguy hiểm hơn: vài tháng sau không ai nhớ phép kiểm đó đã ngừng kiểm từ lúc nào.

Quy tắc thực dụng: dùng tầng bước cho việc mà đỏ là *bình thường* (một lệnh dọn dẹp không có gì để dọn), dùng tầng job cho việc mà đỏ là *bất thường nhưng không được chặn ai*.

## "Xong" khác "xanh"

Một job đợi job khác thì đợi nó **xong**, không phải đợi nó **xanh**. Việc đỏ có lan sang phía sau hay không do dấu chặn quyết định, không do cạnh.

Dù chọn tầng nào, hãy đặt hạn cho nó. Một việc "tạm không chặn" sống ba năm là một việc đã ngừng kiểm tra từ ba năm trước. Và một đường ống mà việc nào cũng không chặn thì không bao giờ đỏ, tức là không kiểm tra gì cả.

## Trong game này

- Stage và bước đều có trường `blocking`. Chú ý nghĩa **đảo** so với khoá của nhà cung cấp: `blocking: false` mới là "đỏ thì đi tiếp".
- Bước chặn bị đỏ thì các bước sau trong stage không chạy và stage đỏ. Bước không chặn bị đỏ thì stage chạy tiếp, và nếu không còn bước chặn nào đỏ thì stage kết thúc xanh.
- Stage phía sau chờ stage phía trước **xong**. Nó chỉ bị chặn, với nguyên nhân `upstream-failed`, khi stage đỏ phía trước là stage chặn. Stage bị chặn không được thử lại, vì nó chưa từng chạy.
- Một commit xanh khi mọi thực thể của mọi **stage chặn** đều xanh ở lần thử cuối. Stage không chặn đỏ không làm commit đỏ, nhưng vẫn hiện đỏ trong bảng.
- Một bước có tỷ lệ đỏ bằng 1 thì đỏ ở mọi lần thử. Thử lại không đổi được gì, chỉ cộng thêm runner-phút.

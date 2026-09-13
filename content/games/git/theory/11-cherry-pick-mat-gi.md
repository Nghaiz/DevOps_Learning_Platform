---
id: 11-cherry-pick-mat-gi
title: Cherry-pick đánh mất điều gì
gameId: git
readMinutes: 4
usedByLevels:
  - git-11-cherry-pick-mat-gi
---

`git cherry-pick <oid>` lấy phần thay đổi của một commit và áp nó lên chỗ bạn đang
đứng. Kết quả là một commit mới: cùng nội dung sửa đổi, khác cha, khác Oid.

```
        C ── D ── E        feature
       /
A ─ B ─── F ── D'          main      (D' mang thay đổi của D)
```

Nội dung thì được chép sang. Thứ **không** được chép sang là quan hệ. `D'` không có
đường nào đi ngược về `D`. Với git, đó là hai commit không liên quan gì đến nhau.

## Cái mất là mối liên hệ, và cái giá phải trả tới sau

Điều này nghe trừu tượng cho tới lúc bạn merge. Giả sử vài ngày sau bạn merge cả
nhánh `feature` vào `main`. Git đi tìm tổ tiên chung, thấy `B`, rồi so ba ngả giữa
`B`, `main` và `feature`. Trong phép so đó, `D` là một thay đổi **chưa** có trên
`main`, bởi vì git không biết `D'` chính là nó.

Kết quả rơi vào một trong hai kiểu, và không kiểu nào dễ chịu:

- **Trộn êm.** Nếu hai bên cho ra đúng cùng những dòng, merge hấp thụ luôn và không
  ai biết gì đã xảy ra. Yên ổn, nhưng chỉ là may.
- **Xung đột.** Nếu vùng mã xung quanh đã đổi, hoặc `D'` được sửa chút ít lúc áp
  vào, bạn sẽ ngồi giải một xung đột giữa một thay đổi và **bản sao của chính nó**.
  Đây là loại xung đột khó chịu nhất, vì hai phía trông gần giống hệt nhau và không
  có phía nào rõ ràng là đúng.

Còn một cái giá nhẹ hơn nhưng lâu dài: lịch sử giờ có hai commit cùng mô tả một thay
đổi. Người đọc `git log` sáu tháng sau sẽ tưởng việc đó được làm hai lần.

## Khi nào cherry-pick là lựa chọn đúng

Khi bạn thật sự cần **một** commit chứ không phải cả nhánh:

- Một bản vá lỗi khẩn nằm trên `main` và phải đưa sang nhánh phát hành `2.1`, trong
  khi phần còn lại của `main` chưa sẵn sàng để phát hành.
- Một commit hữu ích nằm trong một nhánh thử nghiệm mà bạn sẽ vứt đi.

Khi nào thì sai: dùng nó thay cho merge để đưa một nhánh sang từng commit một. Việc
đó chép toàn bộ nhánh mà không tạo được điểm gặp nào, tức là gánh trọn cái giá ở mục
trên mà không nhận được gì.

## Git tự giúp mình tới đâu

Không nhiều, và đáng biết giới hạn đó:

- `git cherry-pick -x` ghi thêm dòng `(cherry picked from commit ...)` vào message.
  Đó là một dòng **chữ** cho người đọc, không phải một cạnh trong đồ thị. Không lệnh
  nào của git dùng nó để suy luận.
- `git cherry` và `git log --cherry-mark` so các commit bằng patch-id, tức băm của
  chính phần thay đổi. Cách này nhận ra được các bản sao **chưa bị sửa gì**, nên nó
  giúp được lúc bạn đi rà soát, chứ không giúp lúc merge đang xung đột.

Nói cách khác: git chấp nhận rằng quan hệ đó đã mất, và chỉ cung cấp vài cách đoán
lại nó về sau.

## Trong game này

Bản sao mang nhãn `duplicate`, và có một **sợi chỉ mờ** nối nó về commit gốc. Sợi
chỉ đó là công cụ dạy học, **không phải một tính năng của git**: git thật không lưu
liên kết này ở đâu cả. Game vẽ ra chính xác cái thứ mà git không có, để bạn nhìn
thấy được thứ đang thiếu.

Khi bạn merge nhánh nguồn vào ở level sau, hãy để ý: sợi chỉ đó vẫn nằm đó trên màn
hình, trong khi thuật toán merge hoàn toàn không nhìn tới nó. Đó là toàn bộ bài học,
gói trong một hình.

**Đơn giản hoá có chủ ý.** Game không hiện thực patch-id, nên `git cherry` không có
ở đây. Điều cần mang theo là mô hình, không phải danh sách lệnh.

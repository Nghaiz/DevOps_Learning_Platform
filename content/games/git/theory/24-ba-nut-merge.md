---
id: 24-ba-nut-merge
title: Ba nút merge trên một PR
gameId: git
readMinutes: 2
usedByLevels:
  - git-24-ba-nut-merge
---

Giao diện PR thường cho ba lựa chọn merge. Chúng không phải ba cách gọi khác nhau của cùng một việc. Chúng để lại ba hình dạng lịch sử khác nhau, và sự khác nhau đó còn ở lại rất lâu sau khi PR đóng.

Giả sử nhánh `feat` có hai commit `C1`, `C2` và `main` đã đi tiếp tới `D`.

## Merge commit

```
A - B - D --- M   <- main
     \       /
      C1 - C2
```

Tạo một commit `M` hai cha. Toàn bộ `C1` và `C2` giữ nguyên Oid và trở thành tổ tiên của `main`. Lịch sử ghi lại đúng sự thật là hai luồng đã chạy song song.

## Squash merge

```
A - B - D - S   <- main     (S chua noi dung cua ca C1 va C2)
     \
      C1 - C2               (khong con la to tien cua main)
```

Gom hết thay đổi thành **một** commit mới trên `main`. Lịch sử nhánh chính sạch, mỗi PR đúng một dòng. Đổi lại, từng bước làm việc bên trong nhánh biến mất khỏi `main`.

## Rebase merge

```
A - B - D - C1' - C2'   <- main
     \
      C1 - C2
```

Phát lại từng commit lên `main`. Lịch sử thẳng và vẫn giữ từng bước, nhưng `C1'` và `C2'` là commit mới với Oid mới.

## Hệ quả chung của hai nút sau

Cả squash lẫn rebase đều làm `C1` và `C2` gốc **không còn là tổ tiên của `main`**. Chúng vẫn nằm trong kho object, vẫn được nhánh `feat` trỏ tới, chỉ là `main` không biết gì về chúng.

Nên nếu bạn giữ lại nhánh `feat` sau khi merge, git sẽ vui vẻ mời bạn merge nó lần nữa, vì đứng ở góc nhìn của đồ thị thì nhánh đó thật sự chưa được gộp. Xoá nhánh sau khi squash hay rebase merge không phải chuyện dọn dẹp cho gọn, nó là cách tránh gộp trùng.

Và nếu ai đó đã pull nhánh `feat` về máy, họ đang giữ một lịch sử mà `main` không thừa nhận. Đó lại đúng là tình huống của bài G19.

## Chọn thế nào

Đội nhỏ, mỗi PR một việc gọn: squash cho lịch sử `main` đọc được như một danh sách tính năng. Thay đổi lớn cần giữ từng bước để sau này `bisect` tìm được commit hỏng: merge hoặc rebase. Quyết định này nên thống nhất cả đội, vì trộn lẫn ba kiểu trong một kho làm lịch sử khó đọc hơn bất kỳ kiểu nào dùng riêng.

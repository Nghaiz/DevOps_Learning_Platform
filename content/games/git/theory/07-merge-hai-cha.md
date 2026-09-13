---
id: 07-merge-hai-cha
title: Merge tạo commit có hai cha
gameId: git
readMinutes: 2
usedByLevels:
  - git-07-merge-hai-cha
---

Một commit merge khác commit thường đúng một chỗ: `parents` của nó có hai phần tử
thay vì một. Không có loại object riêng, không có cờ đánh dấu nào. Chỉ là hai cha.

```
      C ── D        feature
     /       \
A ─ B ─────── M     main      M.parents = [E, D]
     \       /
      E ────         (mạch của main)
```

Từ `M` đi ngược lên, cả hai nhánh lịch sử đều tới được. Merge **không** xoá bên nào,
không làm phẳng bên nào. Nó ghi lại rằng hai mạch gặp nhau tại đây.

## Fast-forward là trường hợp không cần commit

Nếu nhánh bạn đang đứng là tổ tiên của nhánh muốn merge, thì không có gì để trộn:
lịch sử của bạn đã nằm trọn trong lịch sử kia. Git chỉ dời con trỏ nhánh tới trước.
Không commit mới, không cha thứ hai.

Đó là lý do đôi khi `git merge` chạy xong mà đồ thị trông không khác gì trước, chỉ
là nhãn nhánh nhảy tới một chỗ mới. Nhiều người tưởng lệnh chạy hụt. Nó chạy đúng, và
nó vừa nói với bạn rằng hai nhánh chưa hề phân kỳ.

Thêm `--no-ff` để ép tạo commit merge kể cả khi fast-forward được. Có đội làm vậy để
giữ lại dấu vết "chỗ này từng là một nhánh riêng".

## Thứ tự cha có nghĩa

Cha thứ nhất là nhánh bạn **đang đứng trên** lúc gõ lệnh. Cha thứ hai là nhánh bạn
trộn vào. Nên `git merge feature` khi đang ở `main` và `git merge main` khi đang ở
`feature` cho ra hai commit khác nhau, dù nội dung cuối cùng giống hệt.

Từ commit merge, `HEAD^2` là đường sang phía bên kia.

## Trong game này

Đồ thị vẽ cạnh tới cha thứ hai bằng một kiểu cạnh riêng (`merge-parent`) thay vì
cùng kiểu với cạnh cha thứ nhất. Đó không phải trang trí: chỗ hai mạch gặp nhau là
thứ bạn cần đọc được bằng mắt trong một giây, và nếu hai loại cạnh vẽ giống nhau thì
một đồ thị vài chục node sẽ không nói cho bạn biết điều đó.

Trộn hai nhánh cùng sửa một dòng thì sinh ra xung đột, và xung đột có bài riêng ở
chương làm việc nhóm. Ở đây điều đáng nhớ chỉ là **hình dạng**: merge thêm một node
có hai đường đi ngược lên.

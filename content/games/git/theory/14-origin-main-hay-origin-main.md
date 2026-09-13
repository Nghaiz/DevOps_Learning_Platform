---
id: 14-origin-main-hay-origin-main
title: '`origin/main` hay `origin main`'
gameId: git
readMinutes: 2
usedByLevels:
  - git-14-origin-main-hay-origin-main
---

Hai cách viết, khác nhau đúng một dấu gạch chéo, và chúng không có họ hàng gì với nhau.

## `origin main`: hai đối số rời

```
git push origin main
         ^^^^^^ ^^^^
         remote nhánh
```

Đọc là: "đẩy lên remote tên `origin`, nhánh tên `main`". Hai đối số tách biệt bằng khoảng trắng. Cùng cấu trúc đó dùng cho `git pull origin main` và `git fetch origin main`.

## `origin/main`: một cái tên duy nhất

`origin/main` là **một** ref. Tên đầy đủ của nó là `refs/remotes/origin/main`. Dấu gạch chéo nằm bên trong cái tên, giống dấu gạch chéo trong một đường dẫn, nó không tách hai đối số.

Nên bạn dùng nó ở đúng những chỗ dùng được tên một commit:

```
git log origin/main
git diff origin/main
git reset --hard origin/main
```

## Vì sao nhầm lẫn này dai dẳng

Khảo sát ICTERI 2014 xếp đây vào nhóm nhầm lẫn kinh niên của người học. Lý do không phải sinh viên cẩu thả. Hai dạng viết xuất hiện cạnh nhau trong cùng một buổi làm việc, cả hai đều hợp lệ, nên gõ nhầm không ra lỗi cú pháp. Nó ra một hành động khác.

Hai ví dụ cụ thể:

- `git push origin/main` khiến git đi tìm một remote tên là `origin/main`, không thấy, và trả lỗi `no-remote`. Lỗi này dễ nhận ra.
- `git log origin main` thì chạy trơn tru. Nó liệt kê lịch sử của hai ref gộp lại, không phải thứ bạn định xem. Không có lỗi nào báo cho bạn biết.

Trường hợp thứ hai nguy hơn, đúng vì nó im lặng.

## Mẹo đọc

Thấy gạch chéo thì đó là **một chỗ trong lịch sử**, dùng như tên commit. Thấy khoảng trắng thì đó là **một kho và một nhánh**, dùng cho lệnh có đi qua mạng.

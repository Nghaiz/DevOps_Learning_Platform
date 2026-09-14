---
id: 32-bisect-tim-commit-hong
title: '`bisect` tìm commit hỏng'
gameId: git
readMinutes: 2
usedByLevels:
  - git-32-bisect-tim-commit-hong
---

Tháng trước tính năng chạy. Hôm nay nó hỏng. Ở giữa có 200 commit và không ai nhớ ra chuyện gì.

Đọc từng commit là 200 lượt. Chia đôi là khoảng 8 lượt. `git bisect` làm phép chia đôi đó, và nó giữ sổ giúp bạn.

## Cách chạy

```
git bisect start
git bisect bad                  # commit hien tai: hong
git bisect good a1b2c3d         # commit thang truoc: chay
```

Từ đây git tự checkout một commit ở giữa khoảng. Bạn thử, rồi trả lời một trong hai:

```
git bisect good     # commit nay con chay
git bisect bad      # commit nay da hong
```

Mỗi câu trả lời cắt một nửa khoảng còn lại. Lặp lại cho tới khi chỉ còn một commit, và git in ra Oid của nó.

```
git bisect reset
```

Lệnh cuối đưa bạn về chỗ đứng ban đầu. Đừng quên nó.

## Bạn đang ở detached HEAD suốt quá trình

Mỗi lượt, git đưa HEAD trỏ thẳng vào một commit, không qua ref nào. Đúng trạng thái của bài G28.

Biết trước điều này thì `git status` giữa lúc bisect đọc bình thường. Không biết thì nó trông như kho đang hỏng dần sau mỗi lượt trả lời, và người ta hay bỏ ngang ở đó.

Cũng vì vậy mà đừng commit trong lúc bisect. Commit khi detached rồi đi tiếp là cách tạo ra commit không ai trỏ tới, thêm một việc phải cứu bên cạnh việc đang tìm.

## Điều kiện để bisect có nghĩa

Phép chia đôi chỉ đúng khi tính chất bạn đang tìm **đơn điệu**: tốt ở phía trước, hỏng ở phía sau, đổi đúng một lần.

Hai trường hợp phá vỡ điều đó:

**Phép thử không ổn định.** Một bài test lúc xanh lúc đỏ biến bisect thành đi bộ ngẫu nhiên, và kết quả cuối cùng trỏ vào một commit vô tội. Nếu không chắc phép thử, chạy nó vài lần ở mỗi bước.

**Lỗi được sửa rồi tái phát.** Lúc đó có hai lần đổi trạng thái, bisect tìm ra một trong hai và bạn không biết nó tìm ra cái nào.

## Thu hẹp trước cho rẻ

Khoảng càng hẹp thì càng ít lượt thử. Trước khi bắt đầu, thu hẹp bằng những gì bạn đã biết: một lần phát hành gần nhất còn chạy, một ngày mà tính năng còn tốt. Chọn được điểm `good` gần hơn là tiết kiệm được vài lượt.

Trong bảng đo khoảng trống của game, `bisect` là chỗ Learn Git Branching có **0 file** nhắc tới, còn gitmastery.me có 12. Đây là bài cuối cùng, và nó là công cụ duy nhất trong cả game dùng để tìm ra lỗi thay vì sửa hậu quả.

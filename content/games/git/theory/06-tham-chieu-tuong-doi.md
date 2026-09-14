---
id: 06-tham-chieu-tuong-doi
title: Tham chiếu tương đối trong lịch sử
gameId: git
readMinutes: 2
usedByLevels:
  - git-06-tham-chieu-tuong-doi
---

Bạn gần như không bao giờ phải gõ Oid. Git cho phép chỉ vào một commit bằng cách mô
tả đường đi tới nó từ một chỗ đã biết, thường là `HEAD`.

Có hai toán tử, và chúng trả lời hai câu hỏi khác nhau.

| Ký hiệu | Nghĩa |
|---|---|
| `HEAD~n` | lùi `n` bước, **luôn theo cha thứ nhất** |
| `HEAD^n` | lấy cha **thứ n** của đúng commit này |

`~` đi xa, `^` chọn ngả rẽ.

## Vì sao cần cả hai

Với commit thường, chỉ có một cha, nên `HEAD^` và `HEAD~` là cùng một chỗ. Khác biệt
chỉ xuất hiện ở commit merge, nơi `parents` có hai phần tử:

- `HEAD^1` (viết tắt `HEAD^`) là cha thứ nhất, tức nhánh bạn **đang đứng trên** lúc
  merge.
- `HEAD^2` là cha thứ hai, tức nhánh bạn **trộn vào**.
- `HEAD~2` là ông nội theo cha thứ nhất, hoàn toàn không phải `HEAD^2`.

Hai ký hiệu đó trông giống nhau và có nghĩa rất khác nhau. Đây là chỗ đọc nhầm phổ
biến.

Ghép được với nhau, đọc từ trái sang phải:

```
HEAD~2^2    lùi hai bước theo cha thứ nhất, rồi rẽ sang cha thứ hai
main~3      commit thứ ba tính ngược từ đầu nhánh main
```

## Thứ tự cha không phải chuyện hình thức

Vì `parents` là một mảng **có thứ tự**, "cha thứ nhất" là một khái niệm có thật và
ổn định. Nó là lý do `git log --first-parent` đọc được lịch sử của nhánh chính mà bỏ
qua chi tiết bên trong từng nhánh phụ, và là lý do `git revert` trên một commit merge
bắt bạn khai rõ lấy cha nào làm mạch chính.

## Trong game này

`CommitObject.parents` là mảng theo thứ tự: phần tử 0 là cha thứ nhất. `~n` lặp lại
việc lấy phần tử 0 đúng `n` lần; `^n` lấy phần tử thứ `n - 1`. Chỉ vào một cha không
tồn tại thì báo lỗi `not-a-commit`, và thông báo nói rõ commit đó có mấy cha, để bạn
biết ngay mình đang gõ `^2` lên một commit chỉ có một cha.

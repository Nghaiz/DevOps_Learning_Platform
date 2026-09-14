---
id: 09-reset-ba-kieu
title: Ba kiểu reset và ba vùng
gameId: git
readMinutes: 4
usedByLevels:
  - git-09-reset-ba-kieu
---

Perez De Rosso và Jackson (Onward! 2013, MIT) phân tích mô hình khái niệm của git và
chỉ ra một chỗ lệch mà họ gọi là misfit: phiên bản trong index và phiên bản trong
worktree **không trực giao**. Việc một thao tác có chạm vào chúng hay không, theo lời
họ, "tuỳ vào tham số bạn truyền vào".

`git reset` là ví dụ rõ nhất của nhận xét đó. Một cái tên lệnh, ba phạm vi tác động
khác nhau, và cờ quyết định phạm vi thì hay bị bỏ trống.

## Ba chế độ, đọc theo lối cộng dồn

| Chế độ | Dời ref | Đặt lại index | Đặt lại worktree |
|---|---|---|---|
| `--soft` | có | không | không |
| `--mixed` (mặc định) | có | có | không |
| `--hard` | có | có | có |

Đọc bảng theo chiều dọc: mỗi chế độ làm mọi thứ chế độ trên nó làm, cộng thêm một
vùng. Cả ba đều dời con trỏ nhánh, và đó là phần **giống nhau**, không phải phần
khác nhau.

Giả sử bạn vừa commit và muốn quay lại một bước:

- `git reset --soft HEAD~` dời ref lùi một bước. Index vẫn giữ nội dung của commit
  vừa bỏ, nên phần thay đổi hiện ra ở nhóm "sẵn sàng để commit". Dùng khi bạn muốn
  viết lại message hoặc tách commit đó thành hai.
- `git reset --mixed HEAD~` dời ref và đặt lại index theo ref mới. Phần thay đổi
  vẫn còn trên đĩa nhưng rơi xuống nhóm "chưa được stage". Dùng khi bạn muốn chọn
  lại xem `add` những gì.
- `git reset --hard HEAD~` dời cả ba. File trên đĩa quay về đúng trạng thái của
  commit trước. Phần thay đổi biến khỏi worktree.

Mô hình ba mặt phẳng làm chuyện này nhìn thấy được: `--mixed` là khối ở tầng giữa rơi
xuống tầng dưới; `--hard` là khối đó rơi xuyên qua cả hai tầng.

## Cái gì thật sự mất, cái gì chỉ mất đường tới

Đây là phân biệt quan trọng nhất trong bài, và nó cũng phân biệt hai nỗi sợ rất khác
nhau.

**Commit mà reset "bỏ lại phía sau" thì không mất.** Chúng vẫn trong kho object, và
`git reflog` vẫn nhớ nhánh từng trỏ vào đâu. Đưa nhánh về chỗ cũ là một lệnh, và
chương cứu hộ dạy đúng việc đó.

**Thay đổi chưa commit mà `--hard` xoá thì mất thật.** Chúng chưa bao giờ được ghi
thành object, nên không có gì để tìm lại. Ngoại lệ duy nhất là phần bạn đã `add`:
`git add` ghi blob vào kho ngay lập tức, nên nội dung đó vẫn ở đó, dù việc moi ra
cần tới `git fsck`.

Nói gọn: `--hard` nguy hiểm không phải vì nó động tới commit, mà vì nó động tới thứ
chưa từng là commit.

## Một cái tên, hai động từ

`git reset <đường dẫn>` là một thao tác **hoàn toàn khác**, dù viết gần giống:

```
git reset --mixed HEAD~     # dời con trỏ nhánh
git reset HEAD app.ts       # KHÔNG dời gì cả
```

Dạng thứ hai không đụng tới ref. Nó chép một đường dẫn từ HEAD vào index, tức là bỏ
stage cho đúng file đó. Cùng một từ `reset` mang hai nghĩa tuỳ theo bạn có đưa đường
dẫn vào hay không, và đó chính xác là hình dạng misfit mà bài báo MIT mô tả.

Git về sau tách hai việc này thành hai lệnh có tên rõ ràng hơn, và nên dùng chúng:

```
git restore --staged app.ts   # bỏ stage một file
git restore app.ts            # vứt thay đổi trong worktree của một file
```

## Trong game này

Index và worktree là hai bản ghi riêng biệt, hiện ra thành hai mặt phẳng riêng, nên
bạn xem được **chính xác** vùng nào đổi sau mỗi chế độ. Hãy chạy cả ba trên cùng một
trạng thái đầu và đọc bảng ba vùng sau mỗi lần; đó là cách nhanh nhất để bảng ở đầu
bài chuyển từ thứ phải nhớ thành thứ đã hiểu.

Commit bị bỏ lại vẫn nằm trên màn hình, mờ đi, vì kho object trong game không bao giờ
xoá phần tử trong một phiên chơi.

## Bẫy thường gặp

- **Đọc `reset` là "xoá commit".** Nó dời một con trỏ. Sự khác biệt đó là toàn bộ
  chương cứu hộ.
- **Gõ `git reset` trống không.** Đó là `--mixed HEAD`, tức bỏ stage mọi thứ. Vô
  hại, nhưng thường không phải điều người gõ đang định làm.
- **Dùng `--hard` để "cho sạch sẽ".** Nó là lệnh duy nhất trong bài này có thể làm
  mất việc không lấy lại được. Nếu chỉ muốn bỏ stage thì `--mixed` đã đủ.

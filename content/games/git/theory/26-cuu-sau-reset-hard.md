---
id: 26-cuu-sau-reset-hard
title: 'Cứu sau `reset --hard` nhầm'
gameId: git
readMinutes: 2
usedByLevels:
  - git-26-cuu-sau-reset-hard
---

```
git reset --hard HEAD~3
```

Ba commit vừa rời khỏi lịch sử của nhánh. Worktree cũng bị đưa về theo. Màn hình trông như ba buổi làm việc đã bốc hơi.

Chúng vẫn còn nguyên. `reset` chỉ dịch một con trỏ.

## Việc cần làm, theo thứ tự

**Đừng chạy thêm lệnh nào để "sửa".** Đọc nhật ký trước:

```
git reflog
```

```
1a2b3c4 HEAD@{0}: reset: chuyen ve HEAD~3
9f8e7d6 HEAD@{1}: commit: hoan thien man gio hang
```

`HEAD@{1}` là chỗ nhánh vừa rời khỏi, và nó chứa đủ cả ba commit. Có hai đường về:

```
git reset --hard HEAD@{1}      # dua thang nhanh ve cho cu
git branch cuu-ho HEAD@{1}     # dat mot cai ten moi, khong dong den main
```

Đường thứ hai an toàn hơn khi bạn chưa chắc. Nó chỉ thêm một cái tên, không dịch gì cả, nên không có gì để hối tiếc. Xem xong rồi quyết sau.

## Vì sao cách này luôn chạy được

`reset` thay đổi ref. Commit là object, và object không bị đụng tới. Sau lệnh reset, ba commit kia vẫn nằm trong kho, chỉ là không còn ai trỏ vào.

Trong game, hai phép kiểm khác nhau nói lên đúng điều này: có còn trong kho không, và có với tới được không. Sau `reset --hard`, câu trả lời lần lượt là có và không. Cứu hộ chính là đổi câu trả lời thứ hai.

## Thứ reflog không cứu được

Có một ranh giới thật, và đây là lúc gặp nó.

`--hard` là kiểu reset duy nhất ghi đè lên worktree. Nếu lúc đó bạn có thay đổi **chưa commit**, chúng bị ghi đè và không có dòng reflog nào về chúng, đơn giản vì chúng chưa bao giờ nằm trong một commit hay một ref.

Reflog theo dõi con trỏ. Thứ chưa được commit thì chưa có con trỏ nào biết tới.

Đó là lý do `git stash` ở bài G22 đáng giá hơn vẻ ngoài của nó: stash biến việc đang dở thành một commit, tức là kéo nó vào phạm vi mà chương này cứu được.

## Đọc lại lời cảnh báo

Git có in cảnh báo trước khi `--hard` ghi đè việc chưa lưu. Cảnh báo đó thường bị lướt qua, vì nó xuất hiện đúng lúc người ta đang vội. Không có cách nào khác ngoài việc chậm lại nửa giây khi thấy chữ `--hard`.

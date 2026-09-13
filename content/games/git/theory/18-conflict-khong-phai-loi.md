---
id: 18-conflict-khong-phai-loi
title: Conflict không phải lỗi
gameId: git
readMinutes: 2
usedByLevels:
  - git-18-conflict-khong-phai-loi
---

Bài trước nói vì sao conflict xảy ra. Bài này nói bạn làm gì với nó.

## `git add` giữa lúc conflict mang nghĩa khác

Ngày thường, `git add` nghĩa là "đưa thay đổi này vào index để chuẩn bị commit".

Giữa một merge đang xung đột, `git add <file>` nghĩa là **"file này tôi đã quyết xong"**. Git không kiểm tra bạn quyết thế nào, nó chỉ ghi nhận rằng file đó không còn chờ bạn nữa. Bạn có thể `add` một file vẫn còn nguyên marker và git sẽ nhận, vì nó không đọc nội dung để đánh giá.

Nên trình tự là: sửa cho tới khi file đúng ý, kiểm lại là marker đã sạch, rồi mới `add`.

```
git status          # xem file nao dang cho
# sua file
git add src/config.ts
git commit          # git soan san message merge
```

Khi mọi file xung đột đã `add` xong, `git commit` kết thúc merge và tạo commit hai cha. Nếu còn sót file chưa quyết, git trả lỗi `unmerged-paths` và không cho commit. Lỗi đó đang bảo vệ bạn.

## Ba đường ra, và chúng không ngang nhau

**Giữ một bên.** Nhanh nhất. Đúng khi một phía thật sự đã lỗi thời, sai khi bạn chọn chỉ vì nó ở gần con trỏ hơn.

**Trộn tay.** Kết quả không giống bên nào. Đây là trường hợp thường gặp nhất khi hai người cùng sửa một hàm với hai mục đích khác nhau.

**Lùi lại.** `git merge --abort` đưa kho về đúng commit HEAD lúc trước khi merge. Worktree sạch, không còn marker, như chưa có gì xảy ra.

```
git merge --abort
```

`--abort` không phải thất bại. Nó đúng khi bạn nhận ra mình đang merge nhầm nhánh, hoặc khi conflict lớn tới mức phải hỏi người viết phía kia trước đã. Lùi lại rồi merge lại sau vẫn ra cùng kết quả, vì không có gì bị mất đi trong lúc đó.

## Điều duy nhất không lùi được

`--abort` khôi phục được commit và ref. Thứ nó không khôi phục được là phần sửa mà bạn đã gõ vào file conflict rồi chưa lưu đi đâu. Quyết định giải conflict chỉ được ghi lại khi bạn `add` và `commit`.

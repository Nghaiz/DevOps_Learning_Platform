---
id: 16-push-bi-tu-choi
title: Push bị từ chối
gameId: git
readMinutes: 2
usedByLevels:
  - git-16-push-bi-tu-choi
---

Bạn commit xong, gõ `git push`, và git từ chối:

```
! [rejected]  main -> main (non-fast-forward)
```

Đây là một trong số ít thông báo của git đáng đọc kỹ, vì nó vừa chặn bạn vừa nói ra nguyên nhân.

## Fast-forward nghĩa là gì

Push là lời đề nghị: "origin ơi, dịch `refs/heads/main` của bạn tới commit này". Origin chỉ đồng ý khi commit bạn đưa là **con cháu** của commit nó đang giữ. Dịch như thế không làm mất gì, vì mọi thứ origin đang có vẫn nằm trong lịch sử của commit mới. Đó là fast-forward.

Khi lịch sử hai bên đã rẽ nhánh thì không còn quan hệ con cháu nữa:

```
        C  <- main cua ban
       /
A - B
       \
        D  <- origin/main
```

Dịch ref của origin từ `D` sang `C` sẽ làm `D` không còn ref nào trỏ tới. Commit `D` là việc của đồng đội. Git từ chối vì nó không được phép vứt bỏ việc của người khác trong im lặng.

## Từ chối là thông tin, không phải chướng ngại

Chỗ này đáng dừng lại. Lời từ chối không nói "bạn làm sai". Nó nói "có thứ ở origin mà bạn chưa biết". Người mới thường phản ứng bằng cách tìm cờ nào đó để lệnh chạy cho xong, và cờ đó tồn tại thật (`--force`, bài G20). Dùng nó ở đây chính là làm đúng cái việc mà git vừa từ chối làm.

## Đường ra

Lấy phần còn thiếu về trước, rồi push:

```
git fetch
git merge origin/main     # hoac: git rebase origin/main
git push
```

Merge giữ lại hình dạng rẽ nhánh và tạo một commit hai cha. Rebase phát lại commit của bạn lên trên `D` và cho lịch sử thẳng. Bài G19 so sánh hai đường.

Nếu bước merge hoặc rebase đó chạm vào cùng một dòng mà cả hai bên đã sửa, bạn gặp conflict. Đó là bài kế tiếp, và nó không phải tai nạn.

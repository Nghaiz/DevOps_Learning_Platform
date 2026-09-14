---
id: 30-stash-that-lac
title: Stash thất lạc
gameId: git
readMinutes: 2
usedByLevels:
  - git-30-stash-that-lac
---

Bài G22 kết thúc bằng một câu đáng nhớ lại ở đây: **stash là một commit.**

Không phải vùng nhớ riêng, không phải file tạm. Nó là một object cùng loại với mọi commit khác, chỉ khác ở chỗ được gọi tên bằng một danh sách thay vì bằng một ref.

Hệ quả trực tiếp: `git stash drop` xoá **một dòng trong danh sách**. Commit thì vẫn ở nguyên chỗ cũ.

## Stash biến mất bằng những đường nào

```
git stash drop      # xoa co y
git stash pop       # ap xong la xoa muc di, mot chieu
git stash clear     # xoa het, khong hoi lai
```

`pop` là đường hay gây tiếc nhất, vì nó xoá mục ngay cả khi bạn phát hiện ra mình vừa áp nhầm nhánh. Đó là lý do bài G22 khuyên dùng `apply` khi chưa chắc.

## Tìm lại object không ai trỏ tới

```
git fsck --lost-found
```

Lệnh này duyệt kho object và liệt kê những thứ không ref nào với tới. Commit stash thất lạc nằm trong danh sách đó.

Nhận ra nó không khó: commit stash mang đúng câu mô tả bạn đặt lúc cất, kèm tên nhánh lúc cất. Giữa một danh sách các Oid trần trụi, dòng đó thường là dòng duy nhất đọc ra được nghĩa.

## Lấy về

```
git stash apply a1b2c3d      # ap thang tu Oid
git branch cuu-stash a1b2c3d # hoac dat cho no mot cai ten
```

Đường thứ hai đáng dùng khi bạn muốn xem trước nội dung mà chưa muốn đụng vào worktree đang có việc.

## Ý chung của cả chương

Ba bài vừa rồi giải quyết ba tai nạn khác nhau bằng cùng một cách nghĩ. `reset --hard`, xoá nhánh, mất stash: trong cả ba, dữ liệu không đi đâu cả, chỉ có đường dẫn tới nó bị cắt. Việc cứu hộ là tìm lại Oid rồi nối lại một cái tên.

`reflog` tìm Oid khi thứ bị mất từng được một ref trỏ tới. `fsck` tìm Oid khi không ref nào từng trỏ tới, và stash rơi đúng vào trường hợp đó.

Trong game, kho object không xoá nên `fsck` luôn tìm ra. Git thật thì `gc` cuối cùng sẽ dọn, nên cửa sổ cứu hộ có hạn. Cũng chính vì vậy mà phản xạ đáng tập là dừng lại và tra cứu ngay, chứ không phải gõ thêm mười lệnh rồi mới nhớ ra.

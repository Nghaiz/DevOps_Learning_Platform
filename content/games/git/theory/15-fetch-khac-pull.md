---
id: 15-fetch-khac-pull
title: '`fetch` khác `pull`'
gameId: git
readMinutes: 2
usedByLevels:
  - git-15-fetch-khac-pull
---

`git fetch` cập nhật ref theo dõi. `git pull` cập nhật ref theo dõi rồi trộn luôn vào việc của bạn. Khác nhau nằm ở vế thứ hai, và nó lớn hơn vẻ ngoài.

## `fetch` không đụng vào bạn

```
git fetch
```

Sau lệnh này: `origin/main` dịch tới chỗ origin đang đứng. Nhánh `main` của bạn đứng yên. Worktree đứng yên. Index đứng yên. Không commit nào được tạo, không conflict nào xảy ra.

Đó là lý do `fetch` an toàn tuyệt đối. Nó đi hỏi tin rồi ghi lại câu trả lời, hết.

Có tin rồi thì nhìn trước khi quyết:

```
git log main..origin/main
```

Dòng này liệt kê commit có ở `origin/main` mà `main` của bạn chưa có. Biết trước mình sắp trộn vào cái gì thì mới chọn được cách trộn.

## `pull` là hai lệnh dính liền

`git pull` bằng `git fetch` cộng `git merge origin/main`.

Vế merge mới là chỗ có thể sinh commit merge, có thể sinh conflict, và có thể sinh nó ngay giữa lúc bạn đang làm dở một việc khác. `pull` không xấu, nhưng nó quyết định thay bạn hai thứ: trộn vào lúc nào, và trộn bằng cách gì.

`git pull --rebase` đổi vế thứ hai sang rebase. Bài G19 nói kỹ về đánh đổi của lựa chọn đó.

## Khi worktree đang bẩn

Nếu bạn có thay đổi chưa commit và `pull` chạm đúng file đó, git dừng trước khi làm gì cả. Nó không chịu ghi đè thứ chưa được lưu ở đâu. Lúc đó bạn có `git stash` (bài G22) hoặc commit tạm.

## Thói quen đáng có

Đang có việc dở trong worktree thì `fetch` trước, đọc, rồi mới chọn. Vừa mở máy và chưa sửa gì thì `pull` tiết kiệm một lệnh và không mất gì.

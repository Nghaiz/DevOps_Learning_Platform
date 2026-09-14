---
id: 13-clone-kho-thu-hai
title: Clone dựng ra kho thứ hai
gameId: git
readMinutes: 2
usedByLevels:
  - git-13-clone-kho-thu-hai
---

Chương 1 chỉ có một kho. Từ bài này trở đi có hai, và gần như mọi rắc rối của làm việc nhóm sinh ra ở chỗ đó.

`git clone` không tải gì về trong game này. Nó dựng một kho thứ hai ngay trong bộ nhớ, đặt tên là `origin`, rồi chép lịch sử sang kho của bạn. Ở tầng 3D bạn thấy hai khối không gian tách rời, và đó là hình ảnh đúng: hai kho, hai bộ ref, hai đời sống riêng.

Clone xong, chạy `git branch -a`:

```
* main
  remotes/origin/main
```

Hai dòng, hai thứ khác nhau. `main` là nhánh của bạn, tên đầy đủ `refs/heads/main`. `origin/main` là **ref theo dõi**, tên đầy đủ `refs/remotes/origin/main`. Nó không phải nhánh của bạn, và bạn không commit lên nó được.

Ngay lúc vừa clone, cả hai trỏ vào cùng một commit. Chính sự trùng khớp đó làm người mới tưởng chúng là một. Chúng chỉ tình cờ bằng nhau ở giây phút đầu tiên và sẽ lệch ngay khi bạn commit lần thứ nhất.

## Ref theo dõi ghi nhớ, không quan sát

`origin/main` là thứ kho local của bạn **nhớ** về origin ở lần cập nhật gần nhất. Nó không nhìn origin theo thời gian thực. Nếu đồng đội push một commit mới lên origin ngay lúc này, `origin/main` của bạn vẫn đứng yên cho tới khi bạn chạy `git fetch`.

Nói cách khác, `origin/main` trả lời câu hỏi "lần cuối tôi hỏi thì origin ở đâu", chứ không trả lời câu hỏi "origin đang ở đâu".

Sự lệch giữa hai câu hỏi đó không phải khiếm khuyết cần vá. Nó là thứ làm cho `fetch` có ý nghĩa, và là chất liệu của gần hết chương 2.

## Kho `origin` trong game này

Origin dùng đúng cùng một kiểu dữ liệu với kho của bạn, nhưng index, worktree và stash của nó luôn rỗng. Bạn không bao giờ `add` hay `commit` thẳng vào origin. Bot đồng đội thì có commit lên đó, và nó làm đúng như một đồng nghiệp thật: thao tác ở kho riêng rồi push.

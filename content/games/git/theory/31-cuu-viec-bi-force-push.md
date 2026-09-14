---
id: 31-cuu-viec-bi-force-push
title: Cứu việc bị force-push đè
gameId: git
readMinutes: 2
usedByLevels:
  - git-31-cuu-viec-bi-force-push
---

Nối thẳng từ bài G20, lần này bạn ở phía nhận.

Commit của bạn đã lên origin. Ai đó force-push, và bây giờ `origin/main` trỏ vào một lịch sử không có commit của bạn. Nhìn từ origin, việc đó chưa từng tồn tại.

## Trước tiên: đừng pull

Đây là bước quan trọng nhất và nó là một bước **không làm gì cả**.

Kho local của bạn vẫn giữ commit đó, vì chính bạn tạo ra nó. Chừng nào bạn chưa chạy lệnh nào đưa nhánh local theo origin, bạn vẫn đang cầm bản gốc. `git pull` là lệnh phá bản gốc đó, và nó lại đúng là lệnh người ta gõ theo phản xạ khi thấy có gì lạ.

## Nếu chưa pull

```
git log main            # commit cua ban van con day
```

Việc cần làm là đưa nó lên trên lịch sử mới, không phải đẩy lịch sử mới đi:

```
git fetch
git rebase origin/main
git push
```

Rebase phát lại commit của bạn lên gốc mới. Push bình thường, không cờ nào cả, vì bây giờ commit của bạn đã là con cháu của thứ origin đang giữ.

## Nếu đã lỡ pull

Nhánh local đã dịch theo, nhưng lần dịch đó có ghi nhật ký:

```
git reflog
git branch cuu-ho HEAD@{1}
```

`HEAD@{1}` là chỗ nhánh đứng trước khi pull, tức là còn commit của bạn. Có tên rồi thì lấy phần việc đó đặt lên lịch sử mới bằng `rebase` hoặc `cherry-pick`, tuỳ bạn cần bao nhiêu commit.

## Đừng trả đũa bằng force-push

Cách nhanh nhất để "khôi phục" là force-push bản cũ của bạn đè lên. Nó chạy được, và nó làm đúng việc mà bạn vừa là nạn nhân, chỉ đổi chiều.

Kết quả thường thấy là hai người thay nhau đè lên nhau vài lượt, và sau mỗi lượt thì phần việc được cứu lại ít đi. Đường đúng luôn là **đặt việc của mình lên trên**, chứ không phải thay thế việc của người khác.

## Giới hạn thật

Ở đây kho object không xoá nên commit luôn tìm lại được. Ngoài đời, nếu việc đó chỉ từng tồn tại trên một máy mà bạn không có, và dịch vụ lưu trữ không cho tra reflog phía server, thì nó mất thật.

Đó là lý do bài G21 đáng giá: `--force-with-lease` chặn tình huống này trước khi nó xảy ra, và rẻ hơn mọi thứ vừa đọc ở trên.

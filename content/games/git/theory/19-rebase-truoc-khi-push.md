---
id: 19-rebase-truoc-khi-push
title: Rebase trước khi push
gameId: git
readMinutes: 2
usedByLevels:
  - git-19-rebase-truoc-khi-push
---

Push bị từ chối vì lịch sử đã rẽ nhánh (bài G16). Có hai cách hợp nhất lại, và chúng cho hai hình dạng lịch sử khác nhau.

## Merge giữ hình dạng, rebase xoá hình dạng

```
merge:                       rebase:

     C --- M  <- main             C'  <- main
    /     /                      /
A - B - D                  A - B - D
```

`git merge origin/main` tạo commit `M` có hai cha. Lịch sử ghi lại đúng sự thật: hai người làm song song rồi gặp nhau.

`git rebase origin/main` phát lại `C` lên trên `D` thành `C'`. Lịch sử thẳng một hàng, đọc như thể bạn bắt đầu làm sau khi đồng đội đã xong.

```
git pull --rebase
```

Một lệnh cho cả hai bước: fetch, rồi rebase lên ref theo dõi vừa cập nhật.

## Cái giá của rebase

`C'` **không phải** `C`. Nó có cha khác, thời điểm khác, nên Oid khác. `C` vẫn nằm trong kho object, chỉ là không ref nào trỏ tới nữa. Đây chính là bài G08 của chương 1, lần này gặp lại trong bối cảnh có người khác.

Hệ quả cụ thể: nếu `C` đã từng được push lên đâu đó và có người đã pull về, bạn vừa tạo ra một bản sao cạnh bản gốc mà họ đang giữ. Quy tắc thường được nhắc là "đừng rebase nhánh người khác đã dùng", và lý do nằm đúng ở đây chứ không phải ở một điều cấm kỵ nào.

## Conflict có thể lặp lại nhiều lần

Merge trộn một lần: một tổ tiên chung, một lượt giải conflict.

Rebase phát lại **từng commit một**. Rebase ba commit có thể dừng ba lần, mỗi lần với một tình huống conflict riêng. Đó không phải lỗi, đó là hệ quả của việc từng bước được dựng lại độc lập. Bài G29 nói về chuyện sống sót qua một rebase dừng giữa chừng.

## Chọn cái nào

Nhánh riêng của bạn, chưa ai pull: rebase cho lịch sử gọn. Nhánh nhiều người dùng chung, hoặc bạn muốn giữ lại dấu vết hai luồng làm song song: merge.

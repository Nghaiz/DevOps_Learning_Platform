---
id: 29-rebase-do-dang
title: Rebase dở dang
gameId: git
readMinutes: 2
usedByLevels:
  - git-29-rebase-do-dang
---

Rebase không trộn một lần. Nó **phát lại từng commit một** lên gốc mới. Rebase năm commit là năm lượt áp, và mỗi lượt có thể vấp conflict riêng của nó.

Khi một lượt vấp, rebase dừng lại và kho ở trạng thái dở dang: có một thao tác đang chạy, chưa kết thúc, chưa huỷ.

## Kho đang giữ gì lúc đó

Engine nhớ đủ để đi tiếp hoặc lùi lại:

- gốc mới đang rebase lên,
- commit HEAD lúc bắt đầu, tức chỗ để quay về,
- danh sách commit **còn lại** chưa áp, phần tử đầu tiên là cái đang kẹt,
- các file đang xung đột.

`git status` trong lúc này in ra bạn đang ở bước nào trên tổng bao nhiêu. Đọc nó trước khi làm gì khác.

## Ba lệnh điều khiển

```
git rebase --continue   # da giai xong conflict, ap tiep
git rebase --abort      # bo het, ve dung cho truoc khi rebase
git rebase --skip       # BO commit dang ket, di tiep
```

`--continue` chỉ chạy sau khi bạn đã `git add` các file vừa giải. Nếu còn file chưa quyết, git trả lỗi và không đi tiếp.

`--abort` đưa nhánh về đúng commit ban đầu. Những commit mới đã tạo trong lúc rebase trở thành không ai trỏ tới, đúng như mọi trường hợp khác của chương này.

`--skip` là lệnh cần cẩn thận nhất trong ba lệnh. Nó không bỏ qua conflict, nó bỏ luôn **cả commit**. Thay đổi trong commit đó không xuất hiện ở kết quả. Đôi khi đó đúng là điều bạn muốn, ví dụ commit đó đã được người khác đưa vào bằng đường khác. Nhưng dùng `--skip` chỉ vì conflict khó giải là cách vứt việc đi trong im lặng.

## Cái bẫy hay gặp nhất

Giải xong conflict rồi gõ theo phản xạ:

```
git commit
```

Lệnh này chạy được, và nó tạo ra một commit thật. Nhưng rebase vẫn đang dở dang, và bước tiếp theo chưa được áp. Bạn vừa chèn một commit lạ vào giữa một dãy đang được dựng lại.

Giữa một rebase, lệnh kết thúc một bước là `--continue`, không phải `commit`.

## Nếu rối quá

`--abort` luôn có đó. Rebase một dãy dài mà đến bước thứ tư mới thấy mình chọn sai gốc thì huỷ đi và làm lại rẻ hơn nhiều so với đi tiếp cho xong. Không có gì bị mất khi abort, và bạn biết chính xác mình sẽ đứng ở đâu sau đó.

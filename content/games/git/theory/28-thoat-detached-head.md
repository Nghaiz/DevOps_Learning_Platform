---
id: 28-thoat-detached-head
title: Thoát detached HEAD khi đã lỡ commit
gameId: git
readMinutes: 2
usedByLevels:
  - git-28-thoat-detached-head
---

HEAD có hai dạng. Bình thường nó trỏ vào một ref, ví dụ `refs/heads/main`. Sau khi bạn checkout thẳng một commit, nó trỏ vào commit đó, và git gọi trạng thái này là detached HEAD.

Bài G05 của chương 1 đã giới thiệu nó. Bài này nói về chuyện xảy ra khi bạn **commit** trong lúc đang detached.

## Commit khi detached vẫn chạy được

Không có gì ngăn bạn commit. Điều khác biệt là ai dịch chuyển:

```
Binh thuong:   commit lam ref "main" dich len, HEAD di theo vi no tro vao main
Detached:      commit lam chinh HEAD dich len, khong ref nao dich ca
```

Nên sau ba commit trong trạng thái detached, bạn có ba commit mới mà **chỉ HEAD** đang giữ. Chúng thật sự tồn tại, chỉ là chưa có tên.

## Nguy hiểm nằm ở lúc rời đi

```
git switch main
```

HEAD quay về trỏ vào `main`. Ba commit kia mất người trỏ tới ngay lập tức.

Git có in một cảnh báo ở đây, kèm Oid và kèm lệnh đề nghị. Đó là một trong những thông báo hữu ích nhất mà git in ra, và nó cũng là một trong những thông báo bị lướt qua nhiều nhất, vì nó xuất hiện đúng lúc bạn đang chuyển sang việc khác.

## Đường ra trước khi rời đi

Đặt tên cho chỗ đang đứng, rồi muốn đi đâu thì đi:

```
git switch -c thu-nghiem     # tao nhanh tai cho va nhay vao luon
git branch thu-nghiem        # chi tao ten, HEAD van detached
```

Cả hai đều chỉ ghi thêm một dòng vào bảng ref. Rẻ, và không có gì để hối tiếc nếu sau đó bạn không dùng tới.

## Đường ra sau khi đã lỡ

Vẫn là `git reflog`. HEAD ghi lại mọi lần nó dịch chỗ, gồm cả những lần dịch trong lúc detached.

```
git reflog
git branch cuu-ho HEAD@{1}
```

## Một nửa khoảng trống đo được

Trong bảng so sánh của game, detached HEAD là chỗ gitmastery.me có **0 file** nhắc tới, còn Learn Git Branching thì có level. Đó là lý do chủ đề này xuất hiện hai lần: một lần ở chương 1 để nhận mặt, và một lần ở đây để biết đường ra.

Nó cũng là điều kiện cần cho bài cuối cùng: `git bisect` đưa bạn vào detached HEAD ở mỗi bước, và không biết trước điều đó thì cả quy trình bisect trông như kho đang hỏng dần.

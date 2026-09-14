---
id: 12-rebase-tuong-tac
title: Rebase tương tác
gameId: git
readMinutes: 2
usedByLevels:
  - git-12-rebase-tuong-tac
---

`git rebase -i` làm đúng những gì rebase thường làm, nhưng cho bạn xem và sửa
**kịch bản** trước khi nó chạy. Kịch bản là một dòng cho mỗi commit sắp được áp lại,
theo thứ tự từ cũ tới mới.

```
pick a3f1c9e them form dang nhap
pick 7b2e10d sua loi chinh ta
pick c41d0f2 them kiem tra email
```

Bạn sửa cột đầu, và đôi khi sửa cả thứ tự các dòng.

| Hành động | Làm gì |
|---|---|
| `pick` | giữ nguyên |
| `reword` | giữ thay đổi, viết lại message |
| `squash` | gộp vào commit dòng trên, ghép message của cả hai |
| `fixup` | gộp vào commit dòng trên, **vứt** message của dòng này |
| `drop` | bỏ hẳn commit này |
| `edit` | dừng lại tại đây để bạn sửa thêm rồi mới đi tiếp |

`squash` và `fixup` chỉ khác nhau ở chỗ message. Dùng `fixup` cho những commit kiểu
"sửa lỗi chính tả", vì message của chúng không đáng giữ.

Đổi chỗ hai dòng là đổi thứ tự commit, và đó là chỗ dễ sinh xung đột nhất: nếu hai
commit cùng chạm vào một vùng mã thì cái đi sau vốn được viết trên nền cái đi trước,
đảo lại là mất nền.

## Mọi điều về rebase vẫn còn nguyên

Đây vẫn là viết lại lịch sử. Từ commit bị sửa đầu tiên trở đi, **mọi** commit nhận
Oid mới, kể cả những dòng bạn để `pick`. Bản cũ vẫn nằm trong kho object và vẫn mờ
đi trên màn hình. Nếu nhánh đã đẩy lên, hậu quả giống hệt bài trước.

## Trong game này

Kịch bản là dữ liệu chứ không phải một file mở trong trình soạn thảo: mỗi dòng là
một `RebaseStep` gồm hành động, Oid, và message khi cần. Bạn sửa nó ngay trong giao
diện.

Rebase có thể dừng giữa chừng vì xung đột. Lúc đó trạng thái mang một `PendingOp`
kiểu `rebase`, trong đó `remaining` là các bước còn lại và phần tử đầu tiên chính là
bước đang kẹt. Ba lối đi tiếp theo, `--continue`, `--skip` và `--abort`, là chủ đề
của chương cứu hộ.

**Đơn giản hoá có chủ ý.** Game không mở trình soạn thảo ngoài và không có biến môi
trường `GIT_SEQUENCE_EDITOR`. Thứ được giữ lại là phần đáng học: kịch bản là một
danh sách bạn được quyền sửa trước khi nó chạy.

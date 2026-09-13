---
id: 10-revert-khac-reset
title: Revert khác reset ở chỗ nào
gameId: git
readMinutes: 4
usedByLevels:
  - git-10-revert-khac-reset
---

Hai lệnh cùng trả lời câu "tôi muốn bỏ thay đổi này đi", và chúng làm hai việc
ngược hướng nhau. `reset` đi **lùi**: dời con trỏ nhánh về quá khứ. `revert` đi
**tiến**: tạo thêm một commit mới, mang nội dung đảo ngược commit cũ.

```
reset:    A ─ B ─ C          main       (D, E rơi lại phía sau, mờ đi)
               \
                D ─ E

revert:   A ─ B ─ C ─ D ─ E ─ E'  main  (E' huỷ tác dụng của E)
```

Sau `revert`, `E` vẫn nằm trong lịch sử và vẫn đọc được. Thứ bị huỷ là **tác dụng**
của nó, không phải bản ghi về nó.

## Bảng so

| | `reset` | `revert` |
|---|---|---|
| Hướng đi | lùi con trỏ | thêm commit mới |
| Commit cũ trong lịch sử | mất đường tới | còn nguyên |
| Số commit | giảm | tăng |
| An toàn khi nhánh đã đẩy lên | không | có |
| Có thể xung đột | không | có |
| Đụng tới worktree chưa commit | có, nếu `--hard` | không |

## Vì sao revert là lựa chọn đúng cho nhánh chung

Khi một nhánh đã có mặt trên máy người khác, lịch sử của nó không còn là của riêng
bạn. `reset` rồi đẩy lên sẽ bị từ chối, vì lịch sử của bạn không còn chứa lịch sử
đang có trên kho chung. Cách duy nhất để ép là force-push, và force-push trên nhánh
chung là cách gọn gàng nhất để xoá việc của đồng đội.

`revert` không gặp vấn đề đó. Nó chỉ thêm một commit lên phía trước, nên nó là một
lần đẩy bình thường. Không ai phải sửa gì trong kho của họ, không lịch sử nào bị
tuyên bố là sai.

Quy tắc rút gọn đủ dùng trong hầu hết trường hợp: **việc chưa đẩy lên thì `reset`,
việc đã đẩy lên thì `revert`.**

## Revert có thể xung đột, và đó là điều bình thường

`revert` áp một bản vá ngược lên trạng thái **hiện tại**, không phải lên trạng thái
lúc commit cũ được tạo. Nếu vùng mã đó đã bị sửa tiếp trong những commit sau, bản vá
ngược không áp sạch được và bạn phải giải xung đột bằng tay.

Đó không phải lỗi. Nó là cách git nói rằng "huỷ thay đổi này" không còn là một câu
hỏi có đáp án máy móc, vì thế giới đã đi tiếp.

## Revert một commit merge cần thêm một tham số

Một commit merge có hai cha, nên "đảo ngược nó" là câu hỏi thiếu dữ kiện: đảo so với
cha nào? Bạn phải chỉ rõ mạch chính bằng `-m`:

```
git revert -m 1 <oid-merge>
```

`-m 1` nghĩa là giữ cha thứ nhất làm mạch chính, tức huỷ phần đã trộn vào từ nhánh
kia.

Có một cái giá đi kèm, và nó hay làm người ta bất ngờ nhiều tháng sau: nhánh vừa bị
revert sẽ **không tự merge lại được**. Với git, nhánh đó đã được trộn vào rồi, nên
lần merge sau không mang gì thêm, trong khi phần nội dung thì đã bị commit revert gỡ
ra. Muốn đưa lại thì phải revert chính commit revert đó.

## Một va chạm tên gọi đáng nhớ

Trong nhiều trình soạn thảo và công cụ đồ hoạ, nút "Revert file" nghĩa là **vứt bỏ
thay đổi chưa lưu trong worktree**. Đó gần với `git restore` hơn, và nó đi ngược
hướng với `git revert`. Cùng một từ, hai nghĩa, và một trong hai có thể làm mất việc
chưa commit.

## Trong game này

`revert` tạo một `PendingOp` kiểu `revert` mang theo `originalHead`, nên khi nó dừng
lại vì xung đột bạn vẫn có đường lùi sạch sẽ bằng `--abort`. Đồ thị cho thấy rất rõ
hai hình dạng: sau `reset` thì các node rơi lại phía sau và mờ đi; sau `revert` thì
đồ thị dài thêm một node và không có gì mờ cả.

Nhìn hai hình đó cạnh nhau một lần là đủ để không bao giờ nhầm hai lệnh nữa.

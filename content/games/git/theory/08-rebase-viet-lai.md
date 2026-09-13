---
id: 08-rebase-viet-lai
title: Rebase viết lại lịch sử
gameId: git
readMinutes: 4
usedByLevels:
  - git-08-rebase-viet-lai
---

Cách nói thông dụng là rebase "dời các commit sang một gốc khác". Cách nói đó tiện,
và nó là nguồn gốc của gần như mọi hiểu nhầm về rebase.

Rebase không dời gì cả. Nó **tạo ra commit mới** mang cùng phần thay đổi, gắn lên một
gốc khác. Các commit cũ vẫn nằm nguyên trong kho object, chỉ là không còn nhánh nào
trỏ tới chúng.

```
trước:   A ─ B ─ C          main
              \
               D ─ E        feature

sau:     A ─ B ─ C          main
              \   \
               \   D' ─ E'  feature
                \
                 D ─ E      (còn trong kho, không ai trỏ tới)
```

`D'` không phải `D` đã dời chỗ. Nó là một object khác, với Oid khác.

## Vì sao bắt buộc phải là object mới

Danh tính của một commit là băm của nội dung nó chứa, và **danh sách cha nằm trong
nội dung đó**. Đổi cha thì đổi thứ đem đi băm, nên đổi luôn Oid. Không có thao tác
nào "giữ nguyên commit mà thay cha", cũng như không có cách nào đổi giá trị của một
con số mà vẫn là con số cũ.

Trong game này còn một yếu tố nữa: đồng hồ logic cũng đi vào phép băm. Nên kể cả khi
cha không đổi, một commit tạo lại ở thời điểm logic khác vẫn là object khác. Điều đó
phản ánh git thật, nơi thời điểm tạo commit nằm trong object và là lý do `git commit
--amend` hai lần liên tiếp cho hai Oid khác nhau dù nội dung không đổi.

## Ba hệ quả phải thuộc

**Oid của bạn thay đổi.** Sau rebase, mọi liên kết tới commit cũ đều trỏ vào những
object không còn ai với tới: đường dẫn trong ticket, số hiệu trong ghi chú phát
hành, và quan trọng nhất là bản sao mà đồng đội đang có.

**Rebase một nhánh đã công bố sẽ đụng vào việc của người khác.** Kho của đồng đội
vẫn giữ `D` và `E`. Nhánh của bạn giờ có `D'` và `E'`. Hai lịch sử đã phân kỳ, và
đẩy lên sẽ bị từ chối cho tới khi ai đó dùng tới force-push. Toàn bộ hậu quả của
chuyện này là chủ đề của chương làm việc nhóm.

**Không có gì bị xoá.** `D` và `E` vẫn trong kho. `git reflog` vẫn nhớ nhánh từng
trỏ vào đâu. Chương cứu hộ sống nhờ đúng hai sự thật đó.

## Đổi được gì khi chấp nhận cái giá đó

Một lịch sử tuyến tính. Không có commit merge chen vào, `git log` đọc như một danh
sách thay vì một mạng lưới, `git bisect` chạy trên một dãy thẳng, và mỗi commit
trong nhánh của bạn xuất hiện đúng như thể bạn viết nó trên nền mới nhất.

So với merge, đây là một sự đánh đổi chứ không phải một phép so hơn kém:

| | Merge | Rebase |
|---|---|---|
| Lịch sử ghi lại | chuyện đã thật sự xảy ra | chuyện đọc lên gọn gàng |
| Oid cũ | giữ nguyên | bị thay hết |
| Đồ thị | có nhánh và có điểm gặp | một đường thẳng |
| An toàn khi đã đẩy lên | có | không |

Không lựa chọn nào đúng tuyệt đối. Các đội chọn khác nhau, và họ thường viết lựa
chọn đó thành quy ước chung.

## Trong game này

Sau rebase, commit cũ **không biến mất khỏi màn hình**. Chúng ở nguyên vị trí, mờ
đi, mang nhãn `orphaned` và cờ `reachable: false`. Commit mới hiện ra ở gốc mới.

Cách hiển thị đó là có chủ ý và nó là cây cầu sang chương cứu hộ: nếu commit cũ biến
mất khỏi màn hình ngay khi mất ref, người chơi sẽ học được đúng bài học sai, rằng
rebase huỷ thứ gì đó. Kho object trong game **không bao giờ xoá phần tử** trong một
phiên chơi, và đó chính là điều làm việc cứu hộ có ý nghĩa.

## Bẫy thường gặp

- **"Rebase làm mất việc của tôi."** Gần như luôn luôn có nghĩa là rebase đã tạo Oid
  mới còn bạn đang tìm Oid cũ. Việc vẫn còn, chỉ là nó đổi tên.
- **Rebase khi đang có thay đổi chưa commit.** Git từ chối, vì nó sắp phải ghi đè
  lên worktree. Hãy commit hoặc stash trước.
- **Tưởng rebase gộp các commit lại.** Không. Số commit giữ nguyên, trừ khi bạn chủ
  động dùng rebase tương tác để gộp.

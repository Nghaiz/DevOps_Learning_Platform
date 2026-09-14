---
id: 01-commit-la-object
title: Commit là một object bất biến
gameId: git
readMinutes: 2
usedByLevels:
  - git-01-commit-la-object
---

Một commit không phải là "lần bấm nút lưu thứ bảy". Nó là một **object** nằm trong
kho, và tên của nó chính là băm của nội dung nó chứa.

Kho object giữ ba loại:

| Loại | Chứa gì |
|---|---|
| `blob` | nội dung một file |
| `tree` | danh sách đường dẫn, mỗi đường dẫn trỏ tới một blob |
| `commit` | một tree, danh sách cha, message, tác giả |

Commit trỏ tới một tree, tức một **ảnh chụp toàn bộ** thư mục tại thời điểm đó. Nó
không lưu phần khác biệt. Cái diff bạn thấy khi chạy `git log -p` được tính ra lúc
hiển thị, bằng cách so tree của commit với tree của cha nó.

## Đổi một ký tự là đổi danh tính

Vì tên object là băm của nội dung, sửa một ký tự trong file sẽ cho một blob khác,
kéo theo một tree khác, kéo theo một commit khác. Không có cách nào sửa một commit
tại chỗ. `git commit --amend` nghe như sửa, nhưng thứ nó làm là tạo một commit MỚI
rồi dời con trỏ nhánh sang đó. Commit cũ vẫn nằm nguyên trong kho, chỉ là không còn
ai trỏ tới.

Đây là lý do mọi thao tác viết lại lịch sử, từ `amend` tới `rebase` tới
`cherry-pick`, đều sinh ra Oid mới. Và đó cũng là nền móng của cả chương cứu hộ:
thứ "biến mất" thường vẫn còn nguyên.

## Trong game này

Băm là FNV-1a 64 bit, viết ra 16 chữ số hex, và màn hình hiện 7 ký tự đầu đúng
thói quen git thật. Ngoài nội dung, đồng hồ logic cũng đi vào phép băm: hai commit
cùng tree, cùng cha, cùng message nhưng tạo ở hai thời điểm logic khác nhau vẫn là
hai object khác nhau.

**Đơn giản hoá có chủ ý.** Git thật băm bằng SHA-1 (hoặc SHA-256) trên một định
dạng nhị phân có nén zlib, rồi gói object lại thành packfile. Game bỏ hết những thứ
đó, vì nó không bao giờ trao đổi object với một kho git thật. Mở một kho thật ra bạn
sẽ thấy hash 40 ký tự chứ không phải 16. Ý tưởng thì giống hệt, con số thì khác.

## Thử ngay

```
git add ghi-chu.txt
git commit -m "them ghi chu"
git log --oneline
```

Sửa một ký tự trong file, `add` rồi `commit` lần nữa, và so hai dòng `log`. Hai Oid
không có gì giống nhau, dù hai file chỉ lệch đúng một ký tự. Băm không giữ khoảng
cách: đầu vào gần nhau không cho ra đầu ra gần nhau. Đó là tính chất khiến nó dùng
được làm danh tính.

---
id: 27-cuu-nhanh-da-xoa
title: Cứu nhánh đã xoá
gameId: git
readMinutes: 2
usedByLevels:
  - git-27-cuu-nhanh-da-xoa
---

```
git branch -D feat/gio-hang
```

Nhánh biến khỏi `git branch`. Commit trên nhánh đó biến khỏi mọi đồ thị bạn nhìn.

Nhưng nhánh là một ref, và ref là một cái tên trỏ vào một Oid. Xoá nhánh là xoá một dòng trong bảng tên. Commit không nằm trong bảng đó, chúng nằm trong kho object, và kho object không bị lệnh này chạm tới.

## Hai chữ `d` không giống nhau

```
git branch -d feat     # chi xoa khi nhanh da duoc gop vao dau do
git branch -D feat     # xoa khong hoi
```

`-d` từ chối xoá một nhánh chưa được merge. Lời từ chối đó mang thông tin y như lời từ chối push ở bài G16: nó đang nói "nhánh này có commit mà không nơi nào khác giữ". Đổi sang `-D` là cách bỏ qua câu đó, không phải cách trả lời nó.

## Tìm lại Oid

Nhánh đã mất thì nhật ký riêng của nó cũng mất theo. Chỗ cần nhìn là nhật ký của `HEAD`:

```
git reflog
```

```
c4d5e6f HEAD@{0}: checkout: tu feat/gio-hang sang main
a1b2c3d HEAD@{1}: commit: them nut thanh toan
```

Lần cuối bạn rời khỏi nhánh đó, HEAD đã ghi lại mình đang đứng ở đâu. `HEAD@{1}` chính là đỉnh của nhánh vừa bị xoá.

## Dựng lại

```
git branch feat/gio-hang a1b2c3d
```

Nhánh quay lại đúng chỗ cũ, với đúng những commit cũ và đúng Oid cũ. Không có gì được tạo mới, bạn chỉ viết lại một dòng trong bảng tên.

Đây là chỗ thấy rõ nhất vì sao "nhánh là con trỏ" không phải một phép ẩn dụ cho dễ nhớ. Nó là mô tả nguyên văn của cấu trúc dữ liệu, và nó là lý do thao tác cứu hộ này rẻ tới mức gần như không tốn gì.

## Khi nào thì thật sự mất

Trong game thì không bao giờ, vì kho object không xoá.

Ngoài đời, mục reflog hết hạn sau một thời gian và `git gc` sẽ dọn object không ai với tới. Khoảng thời gian đó rộng rãi cho một sai sót phát hiện trong cùng tuần, và không giúp gì cho một nhánh bị xoá từ năm ngoái.

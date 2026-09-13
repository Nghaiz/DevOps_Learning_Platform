---
id: 03-add-khong-phai-tao-file
title: Lệnh add không phải là tạo file
gameId: git
readMinutes: 2
usedByLevels:
  - git-03-add-khong-phai-tao-file
---

Khảo sát của Isomöttönen và Cochez (ICTERI 2014) ghi lại một nhầm lẫn rất cụ thể ở
mục 5.3: sinh viên đọc `git add` theo nghĩa đen của từ "add", tức là **thêm một file
mới vào dự án**. Theo cách hiểu đó, một file đã tồn tại và đã từng commit thì không
cần `add` nữa, vì nó "đã được thêm rồi".

Cách hiểu này hợp lý về mặt ngôn ngữ, và sai về mặt hành vi.

## Nó thật sự làm gì

`git add <đường dẫn>` có nghĩa là:

> Chép nội dung **hiện tại** của đường dẫn này từ worktree vào index.

Không có chữ "mới" nào trong câu đó. Lệnh này không quan tâm file đã tồn tại bao lâu
hay đã được commit bao nhiêu lần. Nó chỉ chép nội dung đang có sang vùng chờ.

Hệ quả là bạn phải `add` **lại** file đó sau **mỗi lần sửa**. Không phải một lần khi
tạo file, mà mỗi lần. Một vòng làm việc bình thường trông như thế này:

```
git add app.ts
git commit -m "sua loi dang nhap"
```

rồi vài phút sau, trên đúng file đó:

```
git add app.ts
git commit -m "them kiem tra email"
```

Cả hai lần `add` đều hợp lệ, và lần thứ hai không có gì bất thường.

## Một cái tên tốt hơn

Nếu đọc `add` là **stage**, mọi thứ sáng ra: "đưa nội dung này lên sân khấu chờ".
Git công nhận điều đó muộn màng bằng cách thêm `git stage` như một bí danh, và bằng
`git restore --staged` để làm thao tác ngược. Cái tên `add` thì ở lại vì lý do lịch
sử.

## Trong game này

`add` đọc dòng của file trong worktree, dựng một blob, ghi blob đó vào kho object,
rồi đặt `index[đường dẫn] = oid`. Chạy `add` hai lần liên tiếp mà không sửa gì thì
lần thứ hai không đổi trạng thái nào cả: cùng nội dung cho cùng Oid, và index vốn
đã trỏ tới Oid đó.

Đó cũng là một cách kiểm tra hiểu biết: nếu `add` nghĩa là "thêm", chạy nó hai lần
phải tạo ra thứ gì đó hai lần. Nó không tạo ra gì cả.

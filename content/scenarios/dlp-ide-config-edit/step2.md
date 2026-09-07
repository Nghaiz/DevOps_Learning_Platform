# Tạo file mới từ editor

Lần này đi ngược chiều: tạo file trong editor, đọc bằng terminal.

Trong khoang editor, tạo một file mới tên `notes.md` trong `/root/lab`
(chuột phải vào thư mục → **New File**), viết vào đó **ít nhất một dòng**
bắt đầu bằng `#`, rồi `Ctrl+S`.

Kiểm bằng terminal:

```
ls -l /root/lab && head -3 /root/lab/notes.md
```{{exec}}

Rồi bấm **Kiểm tra**.

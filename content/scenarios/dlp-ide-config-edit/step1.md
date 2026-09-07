# Sửa một giá trị trong file cấu hình

File `/root/lab/app.conf` đã có sẵn, và nó đang sai một chỗ.

Xem nó trước:

```
cat /root/lab/app.conf
```{{exec}}

Dòng `port=0` là chỗ sai — cổng `0` không phải một cổng phục vụ được.
Nhiệm vụ: đổi nó thành `port=8080`.

**Hãy sửa bằng editor**, không phải bằng `sed`: trong khoang giữa mở
`/root/lab/app.conf`, sửa dòng đó, rồi lưu bằng `Ctrl+S`.

Sau khi lưu, quay sang terminal và xem lại:

```
cat /root/lab/app.conf
```{{exec}}

Nếu terminal thấy `port=8080` thì hai khoang đang nhìn cùng một file — đó là
thứ bài này muốn bạn tự thấy. Rồi bấm **Kiểm tra**.

> Phép kiểm chỉ đọc nội dung file, nên nó **không biết** bạn sửa bằng editor
> hay bằng `sed`. Nó không nói dối về điều đó: sửa bằng cách nào cũng đạt.
> Nhưng nếu bạn dùng `sed` thì bài này chẳng dạy bạn được gì.

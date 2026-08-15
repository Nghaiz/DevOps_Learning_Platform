# Tag là con trỏ, không phải bản sao

Người mới thường tưởng `docker tag` tạo ra một image thứ hai. Nó không. Tag chỉ
là **cái tên trỏ vào** một image đã có — như nhãn dán, không như bản photo.

Xem image của bạn có ID gì:

```
docker images myapp
```{{exec}}

Gắn thêm một tag nữa cho **cùng** image đó:

```
docker tag myapp:1 myapp:stable
```{{exec}}

Giờ nhìn lại:

```
docker images myapp
```{{exec}}

Hai dòng, hai tên khác nhau — nhưng cột `IMAGE ID` **giống hệt**, và cột `SIZE`
không nhân đôi. Đĩa của bạn không hề tốn thêm gì.

Đây là lý do `docker rmi myapp:stable` chỉ gỡ cái tên; dữ liệu image vẫn còn
chừng nào còn một tag khác trỏ vào nó.

## Layer

Image được xếp bằng các **lớp** chồng lên nhau, mỗi chỉ thị trong Dockerfile sinh
ra một lớp. Xem lịch sử:

```
docker history myapp:1
```{{exec}}

Các lớp dưới cùng đến từ `python:3.12-slim`. Chúng **dùng chung** với mọi image
khác cũng dựng từ nền đó — đó là vì sao image thứ hai bạn dựng từ cùng một nền sẽ
gần như không tốn thêm đĩa.

Bấm **Kiểm tra**.

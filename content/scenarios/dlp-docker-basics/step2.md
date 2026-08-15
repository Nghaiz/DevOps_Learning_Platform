# Chạy container và mở cổng

**Image** là bản đóng gói nằm yên. **Container** là một lần chạy của image đó.
Một image chạy được nhiều container cùng lúc, mỗi cái có hệ thống tệp riêng.

Chạy một web server, đặt tên `web`, chạy nền:

```
docker run -d --name web -p 8080:80 nginx:alpine
```{{exec}}

Đọc từng mảnh của lệnh:

- `-d` — chạy nền (detached), trả lại con trỏ ngay thay vì chiếm terminal.
- `--name web` — đặt tên, để các lệnh sau gọi `web` thay vì gõ ID băm.
- `-p 8080:80` — nối cổng **8080 của sandbox** vào **cổng 80 trong container**.
  Không có dòng này thì container vẫn chạy, nhưng không ai gọi tới được.

Xem nó đang chạy:

```
docker ps
```{{exec}}

Giờ gọi thử — từ chính sandbox, qua cổng vừa mở:

```
curl -s -o /dev/null -w 'http=%{http_code}\n' http://localhost:8080/
```{{exec}}

`http=200` nghĩa là nginx trong container đã trả lời.

> `docker ps` chỉ liệt kê container **đang chạy**. Thêm `-a` để thấy cả những cái
> đã dừng — chúng không biến mất, chỉ ngừng lại.

Bấm **Kiểm tra**.

# Chạy container công bố đúng cổng

Bài cuối gộp lại mọi thứ bạn vừa làm — dừng một tiến trình sai, sửa quyền, tạo
user — bằng việc dựng ra thứ mà một job triển khai thật sự cần: **một
container đang chạy và có thể gọi tới được từ bên ngoài chính nó.**

Chạy một web server, đặt tên `lab-web`, công bố cổng `8090` của sandbox vào
cổng `80` trong container:

```
docker run -d --name lab-web -p 8090:80 nginx:alpine
```{{exec}}

Đọc từng mảnh của lệnh:

- `-d` — chạy nền (detached).
- `--name lab-web` — đặt tên, để gọi lại bằng tên thay vì ID băm.
- `-p 8090:80` — nối **cổng 8090 của sandbox** vào **cổng 80 trong
  container**. Thiếu dòng này container vẫn chạy, nhưng không ai gọi tới
  được — đây chính là lỗi hay gặp nhất khi "container chạy nhưng không truy
  cập được".

Xác nhận nó đang chạy:

```
docker ps
```{{exec}}

Gọi thử — từ chính sandbox, qua cổng vừa mở:

```
curl -s -o /dev/null -w 'http=%{http_code}\n' http://localhost:8090/
```{{exec}}

`http=200` nghĩa là container đã trả lời thật, không chỉ "đang chạy" theo
`docker ps`.

> **Vì sao kiểm cả hai, không chỉ `docker ps`?** `docker ps` chỉ nói container
> có đang ở trạng thái `Up` hay không — nó KHÔNG nói cổng có thông hay không.
> Quên `-p` là lỗi phổ biến nhất ở bước này: container vẫn `Up` bình thường,
> `docker ps` không báo gì sai, và chỉ có lệnh `curl` mới lộ ra vấn đề thật.

Bấm **Kiểm tra**.

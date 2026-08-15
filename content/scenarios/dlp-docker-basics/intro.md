# Docker căn bản

Bạn đang có một máy Linux thật, và **Docker chạy bên trong** nó — không phải mô
phỏng, cũng không phải dùng chung Docker của máy chủ. Mọi image bạn kéo về, mọi
container bạn chạy, đều nằm trong sandbox của riêng bạn và biến mất khi phiên kết
thúc.

Sáu bước tới sẽ đi qua:

1. Kéo một image từ Docker Hub
2. Chạy container, mở cổng, gọi thử
3. Xem log và chui vào trong container đang chạy
4. Viết Dockerfile và dựng image của riêng bạn
5. Vì sao `tag` không phải là bản sao
6. Vì sao `pip install` trong Dockerfile lại **không** chạy được ở đây

Thư mục làm việc là `/root/lab-docker`, đã được tạo sẵn. Kiểm tra nhanh:

```
ls -la /root/lab-docker
```{{exec}}

Bạn sẽ thấy `app.py` trong đó — nền tảng đẩy tệp này vào pod trước khi bài bắt
đầu, không phải bạn tạo ra. Bước 4 sẽ dùng tới nó.

Trước khi bắt đầu, kiểm tra Docker đã sẵn sàng:

```
docker version --format 'client={{.Client.Version}} server={{.Server.Version}}'
```{{exec}}

> Nếu lệnh báo không kết nối được daemon, đợi vài giây rồi thử lại — `dockerd`
> khởi động nền cùng lúc với phiên của bạn.

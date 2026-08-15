# Dựng image Docker không cần mạng

Sandbox này chạy Docker **bên trong** container (DinD), nhờ Sysbox — không cần
quyền `privileged`, và không dùng chung Docker daemon của máy chủ. Kiểm tra:

```
docker version --format '{{.Server.Version}}'
```{{exec}}

Sandbox **không nối thẳng ra Internet** (bước sau sẽ giải thích). Nó chỉ được mở
đúng một cánh cửa: một bản sao Docker Hub đặt trong cụm, đủ để `docker pull` các
image chính thức. Mọi kho khác vẫn đóng.

Bước này cố ý **không dùng cánh cửa đó**: với `FROM scratch` — image nền rỗng —
bạn dựng được một image mà không phải tải về bất cứ thứ gì.

Tạo thư mục build và một tệp để đóng gói:

```
mkdir -p /root/lab/img && cd /root/lab/img && echo 'xin chao' > payload.txt
```{{exec}}

Viết Dockerfile:

```
printf 'FROM scratch\nCOPY payload.txt /payload.txt\n' > /root/lab/img/Dockerfile
```{{exec}}

Dựng image, gắn tên `dlp-lab:1`:

```
cd /root/lab/img && docker build -t dlp-lab:1 .
```{{exec}}

Xem kết quả:

```
docker images dlp-lab
```{{exec}}

> Nếu lệnh `docker` báo không kết nối được daemon, đợi vài giây rồi thử lại —
> `dockerd` khởi động nền cùng lúc với phiên của bạn.

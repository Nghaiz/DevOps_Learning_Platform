# Kéo image đầu tiên từ Docker Hub

Một **image** là bản đóng gói bất biến của một hệ thống tệp cộng với metadata để
chạy nó. Bạn không tự dựng mọi thứ từ đầu — bạn bắt đầu từ image người khác đã
dựng sẵn và công bố trên Docker Hub.

Kéo image Python chính thức về:

```
docker pull python:3.12-slim
```{{exec}}

Lệnh này tải vài chục megabyte, nên nó mất một lúc. Khi xong bạn sẽ thấy dòng
`Status: Downloaded newer image for python:3.12-slim`.

Xem những gì đã có trên máy:

```
docker images
```{{exec}}

Cột `SIZE` là kích thước sau khi giải nén, nên nó lớn hơn con số tải về.

## Image này tới từ đâu

Sandbox của bạn **không nối thẳng ra Internet**. Lệnh `docker pull` vừa rồi chạy
được là nhờ cụm có một **registry mirror** đặt bên trong: một bản sao-theo-yêu-cầu
của Docker Hub. Lần đầu ai đó kéo `python:3.12-slim`, mirror tải về từ Hub và giữ
lại; những lần sau nó phục vụ ngay từ trong cụm.

Bạn có thể tự nhìn thấy điều đó:

```
docker info | grep -A1 'Registry Mirrors'
```{{exec}}

Bước 6 sẽ quay lại chuyện này — và cho thấy giới hạn của nó.

Bấm **Kiểm tra** khi image đã về.

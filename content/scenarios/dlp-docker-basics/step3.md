# Xem log và chui vào trong container

Khi một container không chạy như mong đợi, hai câu hỏi đầu tiên luôn là: *nó in
ra gì?* và *bên trong nó trông thế nào?*

## Log

Docker gom `stdout`/`stderr` của tiến trình chính trong container. Xem lại lượt
`curl` bạn vừa gọi ở bước trước:

```
docker logs web
```{{exec}}

Bạn sẽ thấy dòng access log của nginx. Đây là lý do ứng dụng chạy trong container
nên in ra **stdout** thay vì ghi vào tệp log bên trong — ghi vào tệp là tự giấu
mình khỏi công cụ.

## Vào bên trong

`docker exec` chạy một lệnh **mới** bên trong container **đang chạy**:

```
docker exec web ls /usr/share/nginx/html
```{{exec}}

Mở hẳn một shell tương tác cũng được — `-it` là "cấp terminal và giữ stdin mở":

```
docker exec -it web sh -c 'echo "toi da o trong container" > /tmp/dlp-marker && cat /tmp/dlp-marker'
```{{exec}}

Tệp `/tmp/dlp-marker` vừa tạo nằm **trong** container, không nằm trên sandbox.
Tự kiểm chứng:

```
ls /tmp/dlp-marker ; echo "tren sandbox: exit=$?"
```{{exec}}

Nó **không** tồn tại ở đó — hai hệ thống tệp tách biệt. Đó chính là điều khiến
container hữu ích, và cũng là điều khiến người mới bối rối lần đầu.

Bấm **Kiểm tra**.

# Tạo user mới thuộc đúng nhóm

Đội của bạn cần một tài khoản riêng (`deploy`) để chạy job triển khai — không
dùng chung `root`, nhưng vẫn cần gọi được lệnh `docker` mà không phải `sudo`
mỗi lần.

## Tạo user

```
useradd -m deploy
```{{exec}}

`-m` tạo luôn thư mục home (`/home/deploy`) — thiếu cờ này user vẫn tạo được
nhưng không có nơi lưu cấu hình riêng, và một số công cụ triển khai sẽ lỗi khi
không tìm thấy `$HOME`.

Xác nhận:

```
id deploy
```{{exec}}

## Cho phép chạy Docker không cần root

Chạy `docker` không cần `sudo` là nhờ user thuộc **nhóm `docker`** — nhóm này
có sẵn trên máy (gói `docker-ce` tạo ra lúc cài), sở hữu file socket
`/var/run/docker.sock`.

```
usermod -aG docker deploy
```{{exec}}

Đọc kỹ hai cờ:

- `-a` (append) — **thêm vào**, không thay thế nhóm phụ hiện có.
- `-G docker` — nhóm phụ cần thêm.

> ⚠ **Bẫy dễ mắc:** `usermod -G docker deploy` (thiếu `-a`) sẽ **THAY THẾ**
> toàn bộ danh sách nhóm phụ của user bằng đúng một nhóm `docker` — nếu
> `deploy` từng ở nhóm nào khác, nó bị loại khỏi nhóm đó mà không có cảnh báo
> nào. Luôn đi cùng `-a` khi mục đích là "thêm", không phải "đặt lại".

Xác nhận nhóm:

```
groups deploy
```{{exec}}

Bạn sẽ thấy `deploy` xuất hiện trong danh sách kèm `docker`.

Bấm **Kiểm tra**.

# Siết lại quyền một file nhạy cảm

Có một file chứa token bí mật ở `/root/lab-linux/service.secret`. Xem quyền
hiện tại:

```
ls -l /root/lab-linux/service.secret
```{{exec}}

`-rw-r--r--` — chủ sở hữu đọc/ghi được, nhưng **nhóm** và **người khác** đều
đọc được. Trên máy này chỉ có `root`, nên có vẻ vô hại — nhưng đây chính là
quyền mà bạn vừa tạo ra ở bài trước (`useradd deploy`): kể từ giờ, MỌI user
trên máy — kể cả `deploy` mà bạn vừa tạo — đọc được token này.

## Đọc quyền dạng số

```
stat -c '%a' /root/lab-linux/service.secret
```{{exec}}

`644` là quyền đó viết dưới dạng bát phân: chữ số đầu (`6` = đọc+ghi) cho chủ
sở hữu, hai chữ số sau (`4` = chỉ đọc) cho nhóm và người khác.

## Siết lại

Một file bí mật đúng nghĩa chỉ nên có **đúng một** người đọc được — chủ sở
hữu:

```
chmod 600 /root/lab-linux/service.secret
```{{exec}}

Xác nhận:

```
stat -c '%a' /root/lab-linux/service.secret
```{{exec}}

> **Vì sao 600, không phải 640 hay 400?** `600` = chủ sở hữu đọc+ghi, không ai
> khác đọc được — đúng mô hình cho một secret mà chỉ tiến trình sở hữu nó cần
> đọc. `640` (thêm nhóm đọc được) chỉ đúng khi có một NHÓM CỤ THỂ thật sự cần
> chia sẻ nó — mặc định luôn siết chặt nhất trước, nới ra sau khi có lý do rõ
> ràng, không phải ngược lại.

Bấm **Kiểm tra**.

# Sửa script bị mất quyền thực thi

Có một script kiểm tra sức khoẻ ở `/root/lab-linux/healthcheck.sh`. Đọc nội
dung của nó:

```
cat /root/lab-linux/healthcheck.sh
```{{exec}}

Nội dung hoàn toàn ổn — nó chỉ in `OK` rồi thoát mã 0. Vậy mà chạy trực tiếp
nó lại thất bại:

```
/root/lab-linux/healthcheck.sh
```{{exec}}

Bạn sẽ thấy `Permission denied`. Đọc kỹ thông báo lỗi — nó không nói "script
sai", nó nói bạn **không được phép chạy nó**.

## Chẩn đoán

Xem cột quyền:

```
ls -l /root/lab-linux/healthcheck.sh
```{{exec}}

So `-rw-r--r--` với `-rwxr-xr-x`. Ba chữ `r`/`w`/`x` lặp lại ba lần — chủ sở
hữu, nhóm, người khác — và không chữ `x` nào xuất hiện nghĩa là **không ai**
thực thi được file này, kể cả `root`. Nội dung file đúng cú pháp bash không
quan trọng nếu bit thực thi vắng mặt.

## Sửa

```
chmod +x /root/lab-linux/healthcheck.sh
```{{exec}}

Chạy lại và xác nhận:

```
/root/lab-linux/healthcheck.sh
```{{exec}}

> **Vì sao dùng `chmod +x` chứ không `bash healthcheck.sh`?** `bash
> healthcheck.sh` chạy được NGAY CẢ KHI thiếu bit thực thi — vì lúc đó `bash`
> tự đọc nội dung file, không cần hệ điều hành cấp quyền "chạy" cho nó. Đó là
> lý do lỗi này rất hay bị bỏ qua khi test thủ công: người viết luôn gõ `bash
> script.sh` nên không bao giờ thấy `Permission denied`, còn hệ thống tự động
> (cron, systemd, một tiến trình khác `exec` thẳng file) thì luôn gọi file
> trực tiếp và sẽ chết ngay ở lỗi này.

Bấm **Kiểm tra**.

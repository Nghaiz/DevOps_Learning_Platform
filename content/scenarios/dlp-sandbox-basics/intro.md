# Làm quen sandbox

Bạn đang có một máy Linux thật, chạy trong container cô lập. Mọi thứ bạn gõ ở
terminal bên phải đều chạy trong đó — không phải mô phỏng.

Bốn bước tới sẽ đi qua:

1. Tạo và kiểm tra tệp
2. Đọc/ghi JSON bằng `jq`
3. Dựng một image Docker **không cần mạng**
4. Vì sao sandbox không ra được Internet — và cách tự kiểm chứng

Thư mục làm việc là `/root/lab`, đã được tạo sẵn. Kiểm tra nhanh:

```
ls -la /root/lab
```{{exec}}

Bạn sẽ thấy `seed.json` trong đó. Tệp này được nền tảng đẩy vào pod trước khi
bài bắt đầu — không phải bạn tạo ra.

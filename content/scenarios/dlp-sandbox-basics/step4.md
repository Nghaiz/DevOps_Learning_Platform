Nút **Kiểm tra** không chấm theo việc bạn đã bấm gì. Nó chạy một đoạn script ngay trong máy của bạn, soi trạng thái thật (tệp có chưa, nội dung đúng chưa) rồi in từng tiêu chí kèm dấu ✓ hoặc ✗. Bấm thử ngay bây giờ, trước khi làm gì: bạn sẽ thấy ✗ cùng lý do.

Việc của bước này: tạo tệp `~/ghi-chu/ngay-dau.txt` chứa đúng một dòng `xin chào từ <tên máy>`.

Thư mục `ghi-chu` chưa có. Tạo nó trước, cờ `-p` để lệnh không kêu nếu thư mục đã tồn tại:

`mkdir -p ~/ghi-chu`{{exec}}

Ghi một dòng vào tệp. Dấu `>` đưa chữ mà `echo` in ra vào tệp thay vì lên màn hình, còn `$(hostname)` được thay bằng output của lệnh `hostname` trước khi `echo` kịp chạy:

`echo "xin chào từ $(hostname)" > ~/ghi-chu/ngay-dau.txt`{{exec}}

Nhìn bằng mắt trước khi để máy nhìn:

`cat ~/ghi-chu/ngay-dau.txt`{{exec}}

Bấm Kiểm tra lần nữa. Lần này mọi dòng đều là ✓. Chạy lại lệnh `echo` bao nhiêu lần cũng vẫn đạt: `>` ghi đè cả tệp mỗi lần, nên tệp luôn chỉ có một dòng.

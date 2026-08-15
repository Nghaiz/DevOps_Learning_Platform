# Xong rồi

Bạn vừa đi qua vòng đời đầy đủ của một image: kéo về, chạy, quan sát, dựng lại,
đặt tên.

Những thứ đáng mang theo:

- **Image ≠ container.** Image nằm yên; container là một lần chạy của nó.
- **`-p` là thứ nối container với thế giới.** Thiếu nó, container vẫn chạy và vẫn
  vô hình.
- **Ứng dụng trong container nên in ra stdout**, để `docker logs` thấy được.
- **Hệ thống tệp của container tách biệt** với máy chủ — đó là điểm mạnh, không
  phải phiền toái.
- **Tag là con trỏ.** Đặt thêm tên không tốn thêm đĩa.
- **Mã thoát 0 không có nghĩa là việc đã làm xong** — `apt-get update` trong một
  môi trường không có mạng là ví dụ kinh điển.

Sandbox này sẽ bị xoá khi phiên kết thúc: mọi image bạn kéo, container bạn chạy,
tệp bạn tạo đều biến mất. Đó là chủ ý — lần sau bạn bắt đầu từ một máy sạch.

## Đi tiếp

- Thử dựng lại `myapp` với một `app.py` khác, và xem `docker build` chỉ dựng lại
  từ lớp `COPY` trở đi — các lớp phía dưới được dùng lại từ cache.
- Chạy hai container từ cùng một image, mỗi cái một cổng, và tự thuyết phục mình
  rằng chúng không thấy nhau.

# Vì sao `pip install` không chạy được ở đây

Bước này không yêu cầu bạn sửa gì — nó yêu cầu bạn **quan sát** một giới hạn, và
hiểu vì sao nó tồn tại.

Ở bước 1 bạn kéo được image từ Docker Hub. Nên phản xạ tự nhiên là nghĩ sandbox
có Internet. Nó **không có**. Thứ nó có là một cánh cửa duy nhất, mở đúng về phía
mirror của Docker Hub — không gì khác.

Tự kiểm chứng. Thử mở kết nối tới PyPI (kho gói của Python) từ trong một
container:

```
docker run --rm python:3.12-slim python -c "import socket; socket.create_connection(('pypi.org', 443), 3)" ; echo "exit=$?"
```{{exec}}

Lệnh treo khoảng 3 giây rồi ném `TimeoutError`. Đó là kết quả **đúng**.

Giờ so sánh — cùng lúc đó, đường tới Docker Hub vẫn thông:

```
docker pull hello-world ; echo "exit=$?"
```{{exec}}

Hai kết quả trái ngược trong cùng một môi trường chính là bằng chứng: mạng không
chết, nó **bị lọc**. Một `NetworkPolicy` mặc-định-từ-chối mở đúng một chiều tới
mirror, và đóng phần còn lại.

## Hệ quả với Dockerfile của bạn

Mọi chỉ thị cần tải gói từ mạng sẽ **không** chạy được ở đây:

```
RUN pip install requests          # PyPI  — bi chan
RUN apt-get install -y curl       # kho Debian — bi chan
RUN npm install express           # npm registry — bi chan
```

Thứ **chạy được** là những gì đã nằm trong image nền, cộng với những gì bạn `COPY`
vào từ máy mình — đúng như bước 4.

> ### ⚠ Một cái bẫy đáng nhớ hơn cả bài này
>
> `RUN apt-get update` trong môi trường này **vẫn kết thúc với mã 0**, dù nó
> không tải được gì. Nó chỉ in `W: Failed to fetch...` rồi coi như xong. Nghĩa là
> `docker build` của bạn sẽ **thành công** và cho ra một image trong đó apt chẳng
> biết gói nào tồn tại — lỗi chỉ nổ ở `apt-get install` phía sau, cách chỗ sai
> vài dòng.
>
> Bài học chung, không riêng gì ở đây: **mã thoát 0 nghĩa là "lệnh chạy xong",
> không nghĩa là "việc đã làm được"**. Với các bước mạng trong Dockerfile, hãy
> khẳng định kết quả, đừng tin mã thoát.

## Vì sao lại thiết kế như vậy

Bạn có quyền `root` trong sandbox này, và có cả Docker. Nếu pod ra được mạng tự
do, quyền đó với tới được những thứ không thuộc về bài học — dịch vụ nội bộ của
cụm, endpoint metadata của máy chủ, hoặc sandbox của người khác. Cánh cửa hẹp là
thứ khiến việc phát `root` cho người học trở nên an toàn.

Bấm **Kiểm tra** — phép kiểm ở bước này khẳng định rằng PyPI **không** gọi tới
được, **và** mirror thì có.

# Dựng image của riêng bạn

Tới giờ bạn mới chạy image người khác dựng. Bước này bạn dựng một cái.

Vào thư mục làm việc — `app.py` đã nằm sẵn ở đó:

```
cd /root/lab-docker && cat app.py
```{{exec}}

## Dockerfile

Một `Dockerfile` là công thức: bắt đầu từ image nào, thêm gì vào, chạy gì khi
container khởi động.

```
cat > /root/lab-docker/Dockerfile <<'EOF'
FROM python:3.12-slim
WORKDIR /app
COPY app.py .
CMD ["python", "app.py"]
EOF
```{{exec}}

Bốn dòng, bốn ý:

- `FROM python:3.12-slim` — nền. Chính image bạn kéo về ở bước 1, nên bước dựng
  này **không phải tải lại gì**.
- `WORKDIR /app` — thư mục làm việc bên trong image; tạo luôn nếu chưa có.
- `COPY app.py .` — chép tệp từ **thư mục build** vào image. Nguồn nằm trên máy
  bạn, đích nằm trong image.
- `CMD [...]` — lệnh mặc định khi container chạy. Nó **không** chạy lúc dựng.

## Dựng

```
cd /root/lab-docker && docker build -t myapp:1 .
```{{exec}}

Dấu `.` ở cuối là **build context** — thư mục Docker gửi cho daemon để `COPY` có
cái mà chép. Đây là lý do `COPY /etc/passwd` từ ngoài context sẽ thất bại: daemon
không nhìn thấy gì ngoài context.

Chạy thử image vừa dựng:

```
docker run --rm myapp:1
```{{exec}}

`--rm` xoá container ngay khi nó thoát — không thì mỗi lần chạy để lại một xác.

Bấm **Kiểm tra**.

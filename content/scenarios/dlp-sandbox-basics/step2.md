# Đọc và ghi JSON bằng jq

`jq` là công cụ gần như bắt buộc khi làm DevOps: mọi API, mọi `kubectl -o json`,
mọi output của `docker inspect` đều là JSON.

Xem tệp seed đã được đẩy vào:

```
jq . /root/lab/seed.json
```{{exec}}

Nhiệm vụ: tạo `/root/lab/config.json` có `name` là `dlp` và `replicas` là `3`.

Bạn có thể viết tay, hoặc dùng chính `jq` để sinh ra nó:

```
jq -n '{name: "dlp", replicas: 3}' > /root/lab/config.json
```{{exec}}

Cờ `-n` nghĩa là "không đọc đầu vào nào, tự dựng từ biểu thức". Kiểm tra:

```
jq . /root/lab/config.json
```{{exec}}

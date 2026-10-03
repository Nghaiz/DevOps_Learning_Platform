# Nhìn vào trong Pod

Ba lệnh bạn sẽ gõ nhiều nhất khi một Pod có chuyện: `describe`, `logs`, `exec`.

`kubectl describe pod web`{{exec}}

Output dài, nhưng kéo xuống cuối, phần `Events`. Đó là nhật ký của chính Pod:
`Scheduled` (scheduler chọn node), `Pulling` và `Pulled` (kéo image), `Created`,
`Started`. Khi một Pod kẹt ở `Pending` hay `ContainerCreating`, câu trả lời gần như
luôn nằm ở đây, trước cả log.

`kubectl exec` chạy một lệnh bên trong container. Dấu `--` tách cờ của `kubectl`
khỏi lệnh muốn chạy:

`kubectl exec web -- nginx -v`{{exec}}

Thay trang chủ của nginx bằng một dòng của bạn. Lệnh `sh -c` chạy trong Pod, nên
`$(hostname)` là tên của Pod chứ không phải của sandbox:

`kubectl exec web -- sh -c 'echo "xin chào từ $(hostname)" > /usr/share/nginx/html/index.html'`{{exec}}

Gọi thử từ ngay trong Pod:

`kubectl exec web -- wget -qO- http://localhost`{{exec}}

Lượt gọi vừa rồi để lại dấu vết:

`kubectl logs web --tail=3`{{exec}}

Dòng cuối có `"GET / HTTP/1.1" 200` và user agent `Wget`. `kubectl logs` không đọc
file nào cả, nó trả về stdout và stderr của container. Image nginx chính thức trỏ
`access.log` vào stdout, nên mọi request hiện ra ở đây.

Muốn một shell thật trong Pod thì thêm `-it`, gõ `exit` để ra:

```
kubectl exec -it web -- sh
```{{copy}}

Bấm **Kiểm tra**.

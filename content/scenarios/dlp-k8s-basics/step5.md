# Service — gọi được từ trong cụm

Deployment cho bạn Pod luôn tồn tại, nhưng địa chỉ IP của Pod đổi mỗi lần nó
bị thay. **Service** cho bạn một địa chỉ ỔN ĐỊNH đứng trước một nhóm Pod.

```
kubectl expose deployment/web --name=web-svc --port=80 --target-port=80
```{{exec}}

Xem nó:

```
kubectl get service web-svc
```{{exec}}

`CLUSTER-IP` là địa chỉ nội bộ, ổn định — nhưng chỉ gọi được **từ bên trong
cụm**, không từ sandbox bên ngoài (đó là lý do bạn không `curl` thẳng nó từ
đây). Kubernetes tự nối Service với Pod bằng nhãn (`selector`), và ghi lại kết
quả nối đó vào một object riêng — `Endpoints`:

```
kubectl get endpoints web-svc
```{{exec}}

Nếu cột `ENDPOINTS` có ít nhất một `IP:PORT`, Service đã tìm thấy đúng Pod để
đứng trước. Cột đó **rỗng** là lỗi hay gặp nhất khi dùng Service: `selector`
của Service không khớp `label` của Pod — Service tồn tại, nhưng không trỏ tới
đâu cả.

Gọi thử THẬT, từ bên trong một Pod của chính Deployment — qua tên Service,
không qua IP:

```
POD=$(kubectl get pod -l app=web -o jsonpath='{.items[0].metadata.name}') && kubectl exec "$POD" -- bash -c 'exec 3<>/dev/tcp/web-svc/80 && printf "GET / HTTP/1.0\r\n\r\n" >&3 && timeout 2 head -c 80 <&3'
```{{exec}}

Bạn sẽ thấy vài dòng đầu của phản hồi HTTP (`HTTP/1.1 200 OK`, …) — bằng
chứng DNS nội bộ của cụm (`web-svc`) đã trỏ đúng, và cổng 80 đã thông.

Bấm **Kiểm tra**.

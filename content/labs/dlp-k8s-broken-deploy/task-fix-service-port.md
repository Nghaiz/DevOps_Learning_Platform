# Sửa targetPort của Service

Service `broken-port-svc` **đã** chọn đúng Pod — `Endpoints` không rỗng:

```
kubectl get endpoints broken-port-svc
```{{exec}}

Nhưng gọi qua Service vẫn không có gì trả lời. Nếu bạn nhìn kỹ dòng
`ENDPOINTS`, cổng đi kèm mỗi IP không phải `80`. Xem cấu hình Service:

```
kubectl get service broken-port-svc -o jsonpath='{.spec.ports}{"\n"}'
```{{exec}}

`targetPort` là cổng Service **gửi traffic tới, bên trong Pod**. nginx trong
Pod chỉ lắng nghe ở cổng `80` — `targetPort` đang trỏ sai. Đây KHÁC hẳn bài
trước: ở đó Service không chọn được Pod nào; ở đây Service chọn đúng Pod,
nhưng gõ nhầm cửa.

Sửa lại `targetPort` cho khớp cổng thật container đang lắng nghe:

```
kubectl patch service broken-port-svc -p '{"spec":{"ports":[{"port":80,"targetPort":80}]}}'
```{{exec}}

Gọi thử THẬT từ trong một Pod của chính Deployment, qua tên Service:

```
POD=$(kubectl get pod -l app=broken-port -o jsonpath='{.items[0].metadata.name}') && kubectl exec "$POD" -- bash -c 'exec 3<>/dev/tcp/broken-port-svc/80 && printf "GET / HTTP/1.0\r\n\r\n" >&3 && timeout 2 head -c 40 <&3'
```{{exec}}

Bấm **Chấm** khi bạn thấy dòng `HTTP/1.1 200 OK`.

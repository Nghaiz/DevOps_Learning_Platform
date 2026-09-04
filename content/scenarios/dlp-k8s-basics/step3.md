# Deployment — Pod biết tự phục hồi

Xoá Pod trần bạn vừa tạo — nó đã làm xong nhiệm vụ minh hoạ:

```
kubectl delete pod solo-pod
```{{exec}}

Tạo một **Deployment** thay vào đó. Deployment không tự nó chạy container —
nó tạo ra một **ReplicaSet**, và ReplicaSet mới là thứ giữ đúng số Pod bạn
muốn luôn tồn tại:

```
kubectl create deployment web --image=nginx:1.29.0
```{{exec}}

```
kubectl rollout status deployment/web --timeout=60s
```{{exec}}

Xem cây quan hệ Deployment → ReplicaSet → Pod:

```
kubectl get deployment,replicaset,pod -l app=web
```{{exec}}

## Tự chứng minh khả năng phục hồi

Lấy tên Pod hiện tại rồi xoá nó:

```
POD=$(kubectl get pod -l app=web -o jsonpath='{.items[0].metadata.name}') && kubectl delete pod "$POD"
```{{exec}}

Xem lại ngay:

```
kubectl get pod -l app=web
```{{exec}}

Một Pod **MỚI**, tên khác, đã xuất hiện — không phải bạn tạo nó, ReplicaSet
làm việc đó thay bạn. Đây chính là khác biệt bạn vừa quan sát được trực tiếp:
Pod trần biến mất vĩnh viễn khi bị xoá (bước trước); Pod của Deployment được
thay ngay.

Bấm **Kiểm tra** khi Deployment `web` báo `1/1` sẵn sàng.

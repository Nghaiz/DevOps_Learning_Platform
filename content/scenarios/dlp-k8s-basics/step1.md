# Làm quen với cụm của bạn

`kubectl` nói chuyện với **apiserver** của cụm qua REST — mọi thứ trong
Kubernetes đều là một "resource" bạn tạo, đọc, sửa, xoá qua kênh đó.

```
kubectl cluster-info
```{{exec}}

Xem node của cụm:

```
kubectl get nodes -o wide
```{{exec}}

Cột `STATUS` phải là `Ready`. Chỉ **một** node — cụm này KHÔNG hỗ trợ nhiều
node; bước cuối sẽ quay lại chuyện đó.

Xem những loại resource cụm này biết tới:

```
kubectl api-resources | head -20
```{{exec}}

Và namespace bạn sẽ làm việc trong suốt bài này:

```
kubectl get namespaces
```{{exec}}

Mọi lệnh `kubectl` phía sau, nếu không nói khác, đều nhắm vào namespace
`default`.

Bấm **Kiểm tra**.

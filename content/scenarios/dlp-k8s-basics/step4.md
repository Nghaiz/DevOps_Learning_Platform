# ConfigMap — tách cấu hình khỏi image

Tạo một ConfigMap chứa một cặp key/value:

```
kubectl create configmap web-config --from-literal=GREETING="Xin chao tu ConfigMap"
```{{exec}}

Xem nó:

```
kubectl get configmap web-config -o yaml
```{{exec}}

Gắn nó vào Deployment `web` dưới dạng biến môi trường — không sửa Dockerfile,
không dựng lại image:

```
kubectl set env deployment/web --from=configmap/web-config
```{{exec}}

Lệnh này khởi động một **rollout mới** (Pod cũ bị thay bằng Pod mang biến môi
trường mới). Chờ nó xong:

```
kubectl rollout status deployment/web --timeout=60s
```{{exec}}

Xác nhận biến môi trường đã thật sự vào tới container:

```
kubectl exec deploy/web -- printenv GREETING
```{{exec}}

> **Vì sao không sửa image?** Image `nginx:1.29.0` là thứ dùng chung, bất
> biến — nó không thuộc về bạn. ConfigMap là cấu hình RIÊNG của bạn, sống
> ngoài image, gắn vào lúc chạy — đổi ConfigMap không cần dựng lại image,
> không cần đẩy image mới lên đâu cả.

Bấm **Kiểm tra**.

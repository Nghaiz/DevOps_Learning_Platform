# Sửa tag image sai

Deployment `broken-image` đang cố chạy nhưng Pod của nó không bao giờ lên
`Running`. Tìm hiểu vì sao:

```
kubectl get pods -l app=broken-image
```{{exec}}

Cột `STATUS` báo `ErrImagePull` hoặc `ImagePullBackOff` — Kubernetes không
kéo được image đã khai trong Deployment.

```
kubectl describe pod -l app=broken-image
```{{exec}}

Đọc phần `Events` ở cuối — nó nói thẳng image nào không kéo được. Xem chính
xác Deployment đang khai gì:

```
kubectl get deployment broken-image -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
```{{exec}}

Sửa lại bằng đúng tag đã dùng xuyên suốt các bài trước — `nginx:1.29.0`:

```
kubectl set image deployment/broken-image web=nginx:1.29.0
```{{exec}}

Chờ rollout xong và xác nhận:

```
kubectl rollout status deployment/broken-image --timeout=60s
```{{exec}}

Bấm **Chấm** khi Pod đã `Running`/`Ready`.

# Tạo ConfigMap còn thiếu

Deployment `broken-configmap` mount một ConfigMap vào
`/usr/share/nginx/html` — nhưng ConfigMap đó chưa hề tồn tại. Pod của nó kẹt
mãi ở `ContainerCreating`:

```
kubectl get pods -l app=broken-configmap
```{{exec}}

```
kubectl describe pod -l app=broken-configmap
```{{exec}}

Đọc phần `Events` — nó báo rõ: không tìm thấy `configmap
"missing-html-config"`. Xem chính xác Deployment đang trỏ tới ConfigMap nào:

```
kubectl get deployment broken-configmap -o jsonpath='{.spec.template.spec.volumes}{"\n"}'
```{{exec}}

Tạo đúng ConfigMap còn thiếu, với một trang `index.html` bên trong:

```
kubectl create configmap missing-html-config --from-literal=index.html='<h1>Lab K8s da sua xong</h1>'
```{{exec}}

Pod không tự khởi động lại khi ConfigMap xuất hiện muộn — kích nó khởi động
lại:

```
kubectl rollout restart deployment/broken-configmap
```{{exec}}

```
kubectl rollout status deployment/broken-configmap --timeout=60s
```{{exec}}

Bấm **Chấm**.

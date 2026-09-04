# Sửa selector của Service

Service `broken-selector-svc` tồn tại, và Pod đứng sau `broken-selector`
đang `Running`/`Ready` — nhưng gọi tới Service không tới đâu cả. Bằng chứng
khách quan:

```
kubectl get endpoints broken-selector-svc
```{{exec}}

Cột `ENDPOINTS` **rỗng**. So sánh nhãn Pod đang có với nhãn Service đang tìm:

```
kubectl get pods -l app=broken-selector --show-labels
```{{exec}}

```
kubectl get service broken-selector-svc -o jsonpath='{.spec.selector}{"\n"}'
```{{exec}}

Hai bên không khớp. Sửa `selector` của Service để trỏ đúng nhãn Pod đang
mang (`app=broken-selector`):

```
kubectl patch service broken-selector-svc -p '{"spec":{"selector":{"app":"broken-selector"}}}'
```{{exec}}

Xác nhận `Endpoints` không còn rỗng:

```
kubectl get endpoints broken-selector-svc
```{{exec}}

Bấm **Chấm**.

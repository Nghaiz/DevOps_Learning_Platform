# Sửa readiness probe sai đường dẫn

Container của `broken-probe` đang `Running` **thật sự** — nhưng Kubernetes
vẫn báo Pod **chưa Ready**. Xem:

```
kubectl get pods -l app=broken-probe
```{{exec}}

`READY` là `0/1` dù `STATUS` là `Running`. Đây là chỗ khác biệt
Running/Ready hay bị bỏ qua nhất: `Running` chỉ nói container chưa chết;
`Ready` là kết quả của **readiness probe** — Kubernetes tự gọi định kỳ để
hỏi "container này đã sẵn sàng nhận traffic chưa?". Xem probe đang cấu hình
gì:

```
kubectl get deployment broken-probe -o jsonpath='{.spec.template.spec.containers[0].readinessProbe}{"\n"}'
```{{exec}}

```
kubectl describe pod -l app=broken-probe
```{{exec}}

Đọc phần `Events` — nó nói probe thất bại, và ở đường dẫn nào. Probe đang gọi
một đường dẫn không tồn tại trên nginx mặc định. Sửa lại đúng đường dẫn gốc
(`/`):

```
kubectl patch deployment broken-probe --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/path","value":"/"}]'
```{{exec}}

Chờ probe chạy lại (probe cấu hình chu kỳ 3 giây) rồi xác nhận:

```
sleep 5 && kubectl get pods -l app=broken-probe
```{{exec}}

Bấm **Chấm** khi `READY` là `1/1`.

# Pod — đơn vị nhỏ nhất, và vì sao bạn hiếm khi tạo nó trực tiếp

Một **Pod** là đơn vị chạy nhỏ nhất trong Kubernetes — một hoặc nhiều
container cùng chia sẻ network và storage. Tạo một Pod trần, không qua bất kỳ
controller nào:

```
kubectl run solo-pod --image=nginx:1.29.0 --port=80
```{{exec}}

Theo dõi cho tới khi nó `Running`:

```
kubectl get pod solo-pod --watch
```{{exec interrupt}}

`--watch` chạy mãi — bấm Ctrl+C rồi chạy lại `kubectl get pod solo-pod` một
lần nữa khi cột `STATUS` đã là `Running` và `READY` là `1/1`.

Xem chi tiết:

```
kubectl describe pod solo-pod
```{{exec}}

Đọc phần `Events` ở cuối — đó là nhật ký những gì scheduler và kubelet vừa làm
để đưa Pod này tới `Running`: gán node, kéo image, khởi động container.

> **Vì sao bạn hiếm khi gõ `kubectl run` trong công việc thật?** Pod này KHÔNG
> có ai đứng sau nó. Nếu chính nó bị lỗi hoặc bị xoá, không có gì tạo lại nó —
> nó biến mất vĩnh viễn. Bước sau sẽ thay nó bằng một **Deployment**, thứ
> đứng sau Pod và tự phục hồi.

Bấm **Kiểm tra** khi `solo-pod` đã `Running` và `Ready`.

# Pod đầu tiên

**Pod** là đơn vị nhỏ nhất Kubernetes chạy được: một hoặc vài container dùng chung
địa chỉ IP và ổ đĩa. Tạo một Pod chạy nginx:

`kubectl run web --image=nginx:1.27-alpine`{{exec}}

Lệnh trả về ngay, nhưng Pod chưa chạy. Nhìn thử:

`kubectl get pods`{{exec}}

Nhiều khả năng cột `STATUS` đang là `ContainerCreating`: node đang kéo image 20 MB
qua registry mirror. Lần sau dùng lại image này sẽ nhanh hơn hẳn vì nó đã nằm trên
node. Chờ tới khi Pod sẵn sàng:

`kubectl wait --for=condition=Ready pod/web --timeout=120s`{{exec}}

Giờ xem thêm vài cột:

`kubectl get pods -o wide`{{exec}}

- `READY 1/1`: một container, cả một đều chạy.
- `IP` dạng `10.42.0.x`: địa chỉ riêng của Pod, chỉ đi được từ trong cụm.
- `NODE`: Pod rơi vào node nào. Cụm này chỉ có một node nên không có gì để chọn.

Để ý tag `1.27-alpine`. Gõ `--image=nginx` trần thì Kubernetes hiểu là `latest`, và
`latest` hôm nay khác `latest` tháng sau. Hai Pod cùng một lệnh tạo có thể chạy hai
bản nginx khác nhau mà không ai biết. Luôn ghim tag.

Bấm **Kiểm tra**.

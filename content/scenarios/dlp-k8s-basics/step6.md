# Vì sao cụm này chỉ có một node

Bạn đã đi qua Pod → Deployment → ConfigMap → Service trên một cụm **đúng một
node**. Đó không phải giới hạn tạm thời — nền tảng này cố ý CHƯA hỗ trợ cụm
nhiều node cho bài học (multi-node cần đo RAM/CPU riêng và chưa qua phép đo
đó).

Điều đó ảnh hưởng gì tới bạn? `nodeSelector`, `affinity`, `taint`/`toleration`
— mọi công cụ đặt Pod ĐÚNG NODE — vẫn tồn tại trong API, nhưng với một node
thì chúng không có gì để CHỌN GIỮA. Tự kiểm chứng: gắn nhãn cho node của bạn
— việc bạn sẽ làm thật trong một cụm nhiều node để nhóm chúng theo vai trò:

```
NODE=$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}') && kubectl label node "$NODE" dlp-lab=k8s-basics --overwrite
```{{exec}}

Xác nhận:

```
kubectl get nodes --show-labels | grep dlp-lab
```{{exec}}

Trong một cụm thật nhiều node, bước tiếp theo sẽ là thêm
`nodeSelector: {dlp-lab: k8s-basics}` vào một Pod để ép nó chạy đúng node
này. Ở đây, mọi Pod bạn tạo tới giờ đều đã chạy trên đúng node này — vì nó là
node DUY NHẤT trong cụm.

Bấm **Kiểm tra** khi node đã mang nhãn.

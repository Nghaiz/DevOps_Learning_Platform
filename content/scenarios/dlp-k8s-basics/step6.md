# Namespace

Một cụm thật chứa đồ của nhiều nhóm. **Namespace** chia cụm thành từng phòng: tên
Pod chỉ cần là duy nhất trong một namespace, và quyền truy cập thường cấp theo
namespace. Bạn đã thấy hai cái:

`kubectl get namespaces`{{exec}}

`default` là nơi mọi lệnh rơi vào khi bạn không nói gì. `kube-system` là chỗ của
các thành phần hệ thống. Tạo một phòng riêng:

`kubectl create namespace lab`{{exec}}

Dùng lại đúng file YAML của bước trước, chỉ thêm `-n`:

`kubectl apply -f web-pod.yaml -n lab`{{exec}}

`kubectl wait --for=condition=Ready pod/web -n lab --timeout=120s`{{exec}}

Hai Pod cùng tên `web` sống cạnh nhau, mỗi cái một phòng:

`kubectl get pods -A -l app=web`{{exec}}

Còn đây là cái bẫy kinh điển:

`kubectl get pods`{{exec}}

Chỉ thấy Pod ở `default`. Quên `-n` là lý do số một khiến người ta tưởng Pod của
mình "biến mất". Nếu cả buổi làm việc trong một namespace, đổi mặc định cho đỡ gõ
(nhớ đổi về `default` khi xong):

```
kubectl config set-context --current --namespace=lab
```{{copy}}

Bấm **Kiểm tra**.

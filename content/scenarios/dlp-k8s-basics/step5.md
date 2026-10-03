# Viết YAML thay vì gõ cờ

Lệnh `kubectl run` tiện để thử, nhưng không ai review được một dòng lệnh đã gõ hôm
qua. Thứ đi vào Git là file YAML mô tả trạng thái mong muốn. Viết YAML từ trí nhớ
thì dễ sai thụt lề; để `kubectl` sinh khung cho bạn:

`kubectl run web --image=nginx:1.27-alpine --labels=app=web,tier=frontend --port=80 --dry-run=client -o yaml > web-pod.yaml`{{exec}}

`--dry-run=client` nghĩa là không gửi gì lên cụm, chỉ in ra object sẽ được tạo.
`-o yaml` in nó dưới dạng YAML, và `>` ghi vào file.

`cat web-pod.yaml`{{exec}}

Bốn khoá ở cấp ngoài cùng có mặt trong mọi object Kubernetes:

- `apiVersion` và `kind`: loại object (`v1`, `Pod`).
- `metadata`: tên và nhãn (`labels`). Nhãn là cặp khoá–giá trị tuỳ bạn đặt, và là
  cách các object tìm thấy nhau. Bài Service sẽ dựa hẳn vào chúng.
- `spec`: thứ bạn muốn. Ở đây là một container nginx mở cổng 80.

`creationTimestamp: null` và `status: {}` là phần thừa của chế độ dry-run, để đó
cũng không sao. Gửi file lên cụm:

`kubectl apply -f web-pod.yaml`{{exec}}

`kubectl wait --for=condition=Ready pod/web --timeout=120s`{{exec}}

`kubectl get pod web --show-labels`{{exec}}

Chạy lại đúng lệnh `apply` lần nữa:

`kubectl apply -f web-pod.yaml`{{exec}}

Lần này là `pod/web unchanged`. `apply` không có nghĩa "tạo thêm một cái". Nó có
nghĩa "làm cho cụm giống file này", và cụm đã giống rồi. Chạy bao nhiêu lần cũng
ra cùng một kết quả.

Bấm **Kiểm tra**.

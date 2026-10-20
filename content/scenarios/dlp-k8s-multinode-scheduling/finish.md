# Xong

Bạn vừa dùng ba thứ chỉ có nghĩa khi cụm có nhiều hơn một node:

- **`kubectl get nodes`**: số node là một con số quan sát được, không phải giả định.
- **nhãn và `nodeSelector`**: ghim workload xuống đúng chỗ bạn chọn. Trên cụm một
  node, dòng YAML này không làm gì cả và bạn sẽ không bao giờ biết nó sai.
- **DaemonSet và `tolerations`**: "mỗi node một bản sao" là một phép đếm; và
  taint của control-plane là lý do phổ biến nhất khiến phép đếm ấy ra thiếu.

Điều đáng mang đi: rất nhiều cấu hình Kubernetes **trông đúng** trên cụm một
node. Cách duy nhất để biết chúng có đúng không là chạy trên cụm nhiều node,
đúng việc bạn vừa làm.

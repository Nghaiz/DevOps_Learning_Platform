# Kubernetes căn bản

Đây **không phải** một cụm demo dùng chung. Ngay khi phiên của bạn khởi động,
nền tảng tự dựng một cụm **k3s một-node, chạy thật ngay bên trong sandbox của
bạn** — không ai khác thấy được nó, và nó biến mất hoàn toàn khi phiên kết
thúc.

Sáu bước tới sẽ đi qua:

1. Làm quen với cụm: `kubectl get nodes`, api-resources
2. **Pod** — đơn vị chạy nhỏ nhất, và vì sao bạn hiếm khi tạo nó trực tiếp
3. **Deployment** — thứ đứng sau Pod và tự phục hồi khi Pod chết
4. **ConfigMap** — tách cấu hình khỏi image
5. **Service** — địa chỉ ổn định đứng trước Pod hay đổi
6. Vì sao cụm này chỉ có **một** node

`kubectl` đã được cài sẵn và cấu hình trỏ vào cụm này — bạn không cần tự nối
gì cả. Việc duy nhất còn lại là **chờ cụm dựng xong**, thường mất chưa tới một
phút.

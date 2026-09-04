# Xong rồi

Bạn vừa đi từ một cụm trống tới bốn resource nền tảng nhất của Kubernetes:

- **Pod** là đơn vị chạy nhỏ nhất — và một Pod trần không có ai đứng sau nó.
- **Deployment** đứng sau Pod, giữ đúng số bản sao, và thay Pod chết bằng Pod
  mới — bạn vừa thấy điều đó xảy ra thật, không phải đọc trong tài liệu.
- **ConfigMap** tách cấu hình khỏi image — đổi cấu hình không cần dựng lại
  image.
- **Service** cho một địa chỉ ổn định đứng trước Pod hay đổi — và `Endpoints`
  là bằng chứng khách quan nó có đang trỏ đúng chỗ hay không.

Cụm này biến mất khi phiên kết thúc — mọi Deployment, ConfigMap, Service bạn
tạo chỉ sống trong phiên của bạn.

## Đi tiếp

- Xoá Service (`kubectl delete service web-svc`) rồi tạo lại với `selector`
  cố ý sai (`kubectl expose deployment/web --name=web-svc --port=80
  --target-port=80 && kubectl patch service web-svc -p
  '{"spec":{"selector":{"app":"khong-ton-tai"}}}'`) — xem `Endpoints` trở
  thành rỗng ngay lập tức, và tự hỏi vì sao `kubectl get service` không báo
  lỗi gì dù không Pod nào nhận được traffic. Bài lab `dlp-k8s-broken-deploy`
  đi sâu vào đúng lớp lỗi này.
- So sánh `kubectl delete pod <tên>` trên Pod trần (bước 2) và trên Pod của
  Deployment (bước 3) — bạn đã tận mắt thấy khác biệt, giờ hãy giải thích nó
  bằng lời cho người khác.

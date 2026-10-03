# Xoá Pod, và không ai dựng lại

`kubectl delete pod web`{{exec}}

Lệnh chờ vài giây: Kubernetes gửi SIGTERM để nginx đóng kết nối cho tử tế, rồi mới
dọn Pod. Giờ nhìn lại:

`kubectl get pods`{{exec}}

`No resources found`. Trang "xin chào" bạn viết ở bước trước mất theo, vì nó nằm
trong hệ thống tệp của container, và container đi cùng Pod.

Điều đáng nhớ hơn: không có gì dựng Pod lại. Một Pod tạo trần bằng `kubectl run`
giống một tiến trình chạy tay không có ai trông. Node khởi động lại, Pod bị xoá
nhầm, image hỏng: nó mất luôn. Ngoài đời gần như không ai tạo Pod trần cho dịch vụ
thật. Người ta tạo **Deployment**, thứ luôn giữ đủ số Pod mong muốn. Đó là bài tiếp
theo.

Bấm **Kiểm tra**.
